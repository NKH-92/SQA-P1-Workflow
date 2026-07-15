-- Keep every reject/resubmit cycle on one review_request row.
--
-- review_feedback.leader_id is retained as a compatibility column because the
-- currently deployed client embeds profiles through that foreign key. For new
-- rows it represents the feedback author; author_role records the role at the
-- time the immutable history entry was created.

alter table public.review_requests
  add column if not exists review_round integer,
  add column if not exists rejection_count integer,
  add column if not exists last_submitted_at timestamptz;

-- This is a metadata backfill, not a user edit. Suppress updated_at and private
-- mutation-audit triggers so existing requests do not all look newly changed.
-- The migration transaction holds the table lock until triggers are re-enabled.
alter table public.review_requests disable trigger user;

update public.review_requests
   set review_round = coalesce(review_round, 1),
       rejection_count = coalesce(
         rejection_count,
         case when status = 'rejected'::public.review_status then 1 else 0 end
       ),
       last_submitted_at = coalesce(last_submitted_at, created_at);

alter table public.review_requests enable trigger user;

alter table public.review_requests
  alter column review_round set default 1,
  alter column review_round set not null,
  alter column rejection_count set default 0,
  alter column rejection_count set not null,
  alter column last_submitted_at set default now(),
  alter column last_submitted_at set not null;

alter table public.review_requests
  drop constraint if exists review_requests_review_round_check,
  add constraint review_requests_review_round_check check (review_round >= 1),
  drop constraint if exists review_requests_rejection_count_check,
  add constraint review_requests_rejection_count_check check (rejection_count >= 0);

alter table public.review_feedback
  add column if not exists author_role public.app_role not null default 'leader'::public.app_role;

-- Generalize the legacy validation function without renaming it, so applying
-- this migration does not invalidate any deployment that still references the
-- existing database object names.
create or replace function public.validate_review_feedback_leader()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_profile_role(
    new.leader_id,
    new.author_role,
    'review_feedback.leader_id'
  );
  return new;
end;
$$;

revoke all on function public.validate_review_feedback_leader() from public;
revoke all on function public.validate_review_feedback_leader() from anon, authenticated;

drop trigger if exists review_feedback_validate_leader on public.review_feedback;
create trigger review_feedback_validate_leader
before insert or update of leader_id, author_role on public.review_feedback
for each row execute function public.validate_review_feedback_leader();

-- A requester may correct the contents of their own rejected request before
-- resubmitting it. Column grants still prevent direct status/history changes.
drop policy if exists "review_requests_update_self_pending" on public.review_requests;
drop policy if exists "review_requests_update_self_pending_or_rejected" on public.review_requests;
create policy "review_requests_update_self_pending_or_rejected"
on public.review_requests for update
to authenticated
using (
  public.can_use_app()
  and requester_id = (select auth.uid())
  and status in ('pending'::public.review_status, 'rejected'::public.review_status)
)
with check (
  public.can_use_app()
  and requester_id = (select auth.uid())
  and status in ('pending'::public.review_status, 'rejected'::public.review_status)
);

create or replace function public.reject_review_request(
  p_review_request_id uuid,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_current_status public.review_status;
  v_requester_id uuid;
  v_title text;
  v_actor_name text;
  v_rejection_count integer;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.is_active_leader() then raise exception 'permission denied'; end if;
  if p_comment is null or p_comment !~ '[^[:space:]]' or length(p_comment) > 2000 then
    raise exception 'comment is invalid';
  end if;

  select status, requester_id, title
    into v_current_status, v_requester_id, v_title
    from public.review_requests
   where id = p_review_request_id
   for update;
  if not found then raise exception 'review request not found'; end if;
  if v_current_status is distinct from 'pending'::public.review_status then
    raise exception 'only pending review requests can be rejected';
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;

  insert into public.review_feedback (review_request_id, leader_id, author_role, comment)
  values (p_review_request_id, v_actor_id, 'leader'::public.app_role, btrim(p_comment));

  update public.review_requests
     set status = 'rejected'::public.review_status,
         rejection_count = rejection_count + 1
   where id = p_review_request_id
     and status = 'pending'::public.review_status
   returning rejection_count into v_rejection_count;
  if not found then raise exception 'review request status changed'; end if;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id,
    v_requester_id,
    'review_request',
    p_review_request_id,
    'status_changed',
    coalesce(v_actor_name, 'Leader') || ' rejected ' || coalesce(v_title, 'review request'),
    jsonb_build_object(
      'status', 'rejected',
      'feedback', btrim(p_comment),
      'rejection_count', v_rejection_count
    )
  );
end;
$$;

create or replace function public.add_review_feedback(
  p_review_request_id uuid,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_feedback_id uuid;
  v_requester_id uuid;
  v_title text;
  v_actor_name text;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.is_active_leader() then raise exception 'permission denied'; end if;
  if p_comment is null or p_comment !~ '[^[:space:]]' or length(p_comment) > 2000 then
    raise exception 'comment is invalid';
  end if;

  select requester_id, title
    into v_requester_id, v_title
    from public.review_requests
   where id = p_review_request_id
   for update;
  if not found then raise exception 'review request not found'; end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;

  insert into public.review_feedback (review_request_id, leader_id, author_role, comment)
  values (p_review_request_id, v_actor_id, 'leader'::public.app_role, btrim(p_comment))
  returning id into v_feedback_id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id,
    v_requester_id,
    'review_feedback',
    v_feedback_id,
    'created',
    coalesce(v_actor_name, 'Leader') || ' added feedback to ' || coalesce(v_title, 'review request'),
    jsonb_build_object('review_request_id', p_review_request_id)
  );
  return v_feedback_id;
end;
$$;

create or replace function public.resubmit_review_request(
  p_review_request_id uuid,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := (select auth.uid());
  v_current_status public.review_status;
  v_requester_id uuid;
  v_title text;
  v_actor_name text;
  v_next_round integer;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() or not public.profile_has_role(v_actor_id, 'member'::public.app_role) then
    raise exception 'permission denied';
  end if;
  if p_comment is null or p_comment !~ '[^[:space:]]' or length(p_comment) > 2000 then
    raise exception 'comment is invalid';
  end if;

  select status, requester_id, title
    into v_current_status, v_requester_id, v_title
    from public.review_requests
   where id = p_review_request_id
   for update;
  if not found then raise exception 'review request not found'; end if;
  if v_requester_id is distinct from v_actor_id then
    raise exception 'only the requester can resubmit this review request';
  end if;
  if v_current_status is distinct from 'rejected'::public.review_status then
    raise exception 'only rejected review requests can be resubmitted';
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;

  insert into public.review_feedback (review_request_id, leader_id, author_role, comment)
  values (p_review_request_id, v_actor_id, 'member'::public.app_role, btrim(p_comment));

  update public.review_requests
     set status = 'pending'::public.review_status,
         review_round = review_round + 1,
         last_submitted_at = clock_timestamp()
   where id = p_review_request_id
     and requester_id = v_actor_id
     and status = 'rejected'::public.review_status
   returning review_round into v_next_round;
  if not found then raise exception 'review request status changed'; end if;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id,
    null,
    'review_request',
    p_review_request_id,
    'resubmitted',
    coalesce(v_actor_name, 'Member') || ' resubmitted ' || coalesce(v_title, 'review request'),
    jsonb_build_object(
      'from_status', 'rejected',
      'status', 'pending',
      'review_round', v_next_round,
      'feedback', btrim(p_comment)
    )
  );
end;
$$;

revoke all on function public.reject_review_request(uuid, text) from public;
revoke all on function public.reject_review_request(uuid, text) from anon, authenticated;
grant execute on function public.reject_review_request(uuid, text) to authenticated;

revoke all on function public.add_review_feedback(uuid, text) from public;
revoke all on function public.add_review_feedback(uuid, text) from anon, authenticated;
grant execute on function public.add_review_feedback(uuid, text) to authenticated;

revoke all on function public.resubmit_review_request(uuid, text) from public;
revoke all on function public.resubmit_review_request(uuid, text) from anon, authenticated;
grant execute on function public.resubmit_review_request(uuid, text) to authenticated;
