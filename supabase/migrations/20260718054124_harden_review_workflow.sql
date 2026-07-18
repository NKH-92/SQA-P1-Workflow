-- Stage A: additive review/auth hardening. Existing attachment storage and legacy
-- mutation privileges intentionally remain for the short compatibility window.

alter table public.review_requests
  add column if not exists status_changed_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists withdrawn_at timestamptz,
  add column if not exists withdrawn_by uuid references public.profiles(id) on delete restrict,
  add column if not exists withdrawal_reason text;

update public.review_requests
   set status_changed_at = coalesce(status_changed_at, updated_at, created_at),
       last_submitted_at = coalesce(last_submitted_at, created_at),
       closed_at = case
         when status in ('approved', 'rejected') then coalesce(closed_at, updated_at, created_at)
         else null
       end;

alter table public.review_requests
  alter column status_changed_at set default now(),
  alter column status_changed_at set not null;

alter table public.review_requests
  drop constraint if exists review_requests_withdrawal_state_check;
alter table public.review_requests
  add constraint review_requests_withdrawal_state_check check (
    (status = 'withdrawn' and withdrawn_at is not null and withdrawn_by is not null
      and char_length(btrim(withdrawal_reason)) between 2 and 500)
    or
    (status <> 'withdrawn' and withdrawn_at is null and withdrawn_by is null and withdrawal_reason is null)
  );

create index if not exists review_requests_recent_closed_idx
  on public.review_requests(closed_at desc, id desc)
  where status in ('approved', 'rejected');
create index if not exists review_requests_withdrawn_idx
  on public.review_requests(withdrawn_at desc, id desc)
  where status = 'withdrawn';

alter table public.review_feedback
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by uuid references public.profiles(id) on delete restrict,
  add column if not exists void_reason text;

alter table public.review_feedback
  drop constraint if exists review_feedback_void_state_check;
alter table public.review_feedback
  add constraint review_feedback_void_state_check check (
    (voided_at is null and voided_by is null and void_reason is null)
    or
    (voided_at is not null and voided_by is not null
      and char_length(btrim(void_reason)) between 2 and 500)
  );

create table if not exists public.review_events (
  id bigint generated always as identity primary key,
  review_request_id uuid not null references public.review_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_name_snapshot text not null,
  event_type text not null check (event_type in (
    'submitted', 'resubmitted', 'approved', 'rejected', 'reopened', 'withdrawn',
    'feedback_added', 'feedback_updated', 'feedback_voided'
  )),
  from_status public.review_status,
  to_status public.review_status,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  transaction_id bigint not null default txid_current()
);

create index if not exists review_events_request_id_idx
  on public.review_events(review_request_id, id desc);
create index if not exists review_events_type_time_idx
  on public.review_events(event_type, occurred_at desc, id desc);

create table if not exists public.review_read_receipts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  review_request_id uuid not null references public.review_requests(id) on delete cascade,
  last_seen_event_id bigint not null references public.review_events(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (user_id, review_request_id)
);

alter table public.review_events enable row level security;
alter table public.review_read_receipts enable row level security;

drop policy if exists review_events_select_relevant on public.review_events;
create policy review_events_select_relevant
on public.review_events for select to authenticated
using (
  public.can_use_app()
  and exists (
    select 1
      from public.review_requests request
     where request.id = review_events.review_request_id
       and (public.is_active_leader() or request.requester_id = auth.uid())
  )
);

drop policy if exists review_read_receipts_select_self on public.review_read_receipts;
create policy review_read_receipts_select_self
on public.review_read_receipts for select to authenticated
using (public.can_use_app() and user_id = auth.uid());

revoke all on table public.review_events from public, anon, authenticated;
revoke all on table public.review_read_receipts from public, anon, authenticated;
revoke all on sequence public.review_events_id_seq from public, anon, authenticated;
grant select on table public.review_events to authenticated;
grant select on table public.review_read_receipts to authenticated;
grant select, insert, update, delete on table public.review_events to service_role;
grant select, insert, update, delete on table public.review_read_receipts to service_role;
grant usage, select on sequence public.review_events_id_seq to service_role;

create or replace function private.enforce_review_status_timestamps()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_role public.app_role;
begin
  if tg_op = 'INSERT' then
    new.status_changed_at := coalesce(new.status_changed_at, new.created_at, v_now);
    new.last_submitted_at := coalesce(new.last_submitted_at, new.created_at, v_now);
    return new;
  end if;

  if old.status is not distinct from new.status then
    return new;
  end if;

  new.status_changed_at := v_now;
  if new.status in ('approved', 'rejected') then
    new.closed_at := v_now;
    new.withdrawn_at := null;
    new.withdrawn_by := null;
    new.withdrawal_reason := null;
  elsif new.status = 'pending' then
    new.closed_at := null;
    new.withdrawn_at := null;
    new.withdrawn_by := null;
    new.withdrawal_reason := null;
    select role into v_role from public.profiles where id = auth.uid();
    if v_role = 'member' and old.status = 'rejected' then
      new.last_submitted_at := v_now;
    end if;
  elsif new.status = 'withdrawn' then
    if new.withdrawn_by is distinct from auth.uid()
      or new.withdrawal_reason is null
      or char_length(btrim(new.withdrawal_reason)) < 2 then
      raise exception using
        errcode = 'P0001',
        message = 'review withdrawal requires the current actor and a reason',
        detail = 'SQA_REVIEW_WITHDRAW_REASON_REQUIRED';
    end if;
    new.closed_at := v_now;
    new.withdrawn_at := v_now;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_review_status_timestamps() from public, anon, authenticated;
drop trigger if exists review_requests_enforce_status_timestamps on public.review_requests;
create trigger review_requests_enforce_status_timestamps
before insert or update of status on public.review_requests
for each row execute function private.enforce_review_status_timestamps();

create or replace function private.record_review_request_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_actor_role public.app_role;
  v_event_type text;
begin
  select name, role into v_actor_name, v_actor_role
    from public.profiles where id = v_actor_id;

  if tg_op = 'INSERT' then
    v_event_type := 'submitted';
  elsif new.status = 'approved' then
    v_event_type := 'approved';
  elsif new.status = 'rejected' then
    v_event_type := 'rejected';
  elsif new.status = 'withdrawn' then
    v_event_type := 'withdrawn';
  elsif new.status = 'pending' and v_actor_role = 'member' then
    v_event_type := 'resubmitted';
  elsif new.status = 'pending' then
    v_event_type := 'reopened';
  else
    return new;
  end if;

  insert into public.review_events (
    review_request_id, actor_id, actor_name_snapshot, event_type,
    from_status, to_status, occurred_at, metadata
  ) values (
    new.id,
    v_actor_id,
    coalesce(v_actor_name, case when tg_op = 'INSERT' then '요청자' else '시스템' end),
    v_event_type,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    coalesce(new.status_changed_at, clock_timestamp()),
    jsonb_build_object('review_round', coalesce(new.review_round, 1), 'estimated', false)
  );
  return new;
end;
$$;

revoke all on function private.record_review_request_event() from public, anon, authenticated;
drop trigger if exists review_requests_record_submitted_event on public.review_requests;
create trigger review_requests_record_submitted_event
after insert on public.review_requests
for each row execute function private.record_review_request_event();
drop trigger if exists review_requests_record_status_event on public.review_requests;
create trigger review_requests_record_status_event
after update of status on public.review_requests
for each row when (old.status is distinct from new.status)
execute function private.record_review_request_event();

-- Preserve the existing private status ledger while the compact public event stream
-- becomes the cross-device notification/statistics source of truth.
drop trigger if exists review_requests_record_private_status_event on public.review_requests;
create trigger review_requests_record_private_status_event
after update of status on public.review_requests
for each row when (old.status is distinct from new.status)
execute function private.record_review_status_event();

create or replace function private.record_review_feedback_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_event_type text;
begin
  if tg_op = 'INSERT' and new.author_role <> 'leader' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    v_event_type := 'feedback_added';
  elsif old.voided_at is null and new.voided_at is not null then
    v_event_type := 'feedback_voided';
  elsif old.comment is distinct from new.comment then
    v_event_type := 'feedback_updated';
  else
    return new;
  end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;
  insert into public.review_events (
    review_request_id, actor_id, actor_name_snapshot, event_type, occurred_at, metadata
  ) values (
    new.review_request_id,
    v_actor_id,
    coalesce(v_actor_name, '파트장'),
    v_event_type,
    clock_timestamp(),
    jsonb_build_object(
      'feedback_id', new.id,
      'reason_length', case when new.void_reason is null then null else char_length(new.void_reason) end,
      'estimated', false
    )
  );
  return new;
end;
$$;

revoke all on function private.record_review_feedback_event() from public, anon, authenticated;
drop trigger if exists review_feedback_record_event on public.review_feedback;
create trigger review_feedback_record_event
after insert or update of comment, voided_at on public.review_feedback
for each row execute function private.record_review_feedback_event();

-- Existing rows are deliberately marked estimated and pre-read to avoid a deployment flood.
insert into public.review_events (
  review_request_id, actor_id, actor_name_snapshot, event_type,
  from_status, to_status, occurred_at, metadata
)
select request.id, request.requester_id, coalesce(profile.name, '요청자'), 'submitted',
       null, 'pending', request.created_at,
       jsonb_build_object('review_round', 1, 'estimated', true, 'backfill', true)
  from public.review_requests request
  left join public.profiles profile on profile.id = request.requester_id;

insert into public.review_events (
  review_request_id, actor_id, actor_name_snapshot, event_type,
  from_status, to_status, occurred_at, metadata
)
select request.id, null, '이관 데이터', request.status::text,
       'pending', request.status, coalesce(request.closed_at, request.updated_at, request.created_at),
       jsonb_build_object('estimated', true, 'timestamp_source', 'updated_at')
  from public.review_requests request
 where request.status in ('approved', 'rejected');

insert into public.review_read_receipts (user_id, review_request_id, last_seen_event_id, read_at)
select profile.id, request.id, max(event.id), now()
  from public.profiles profile
  join public.review_requests request
    on profile.role = 'leader' or request.requester_id = profile.id
  join public.review_events event on event.review_request_id = request.id
 group by profile.id, request.id
on conflict (user_id, review_request_id) do update
set last_seen_event_id = greatest(review_read_receipts.last_seen_event_id, excluded.last_seen_event_id),
    read_at = excluded.read_at;

create or replace function private.mark_password_current_from_auth_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
     set must_change_password = false,
         updated_at = clock_timestamp()
   where id = new.id
     and must_change_password = true;
  return new;
end;
$$;

revoke all on function private.mark_password_current_from_auth_change() from public, anon, authenticated;
drop trigger if exists on_auth_password_changed on auth.users;
create trigger on_auth_password_changed
after update of encrypted_password on auth.users
for each row
when (old.encrypted_password is distinct from new.encrypted_password)
execute function private.mark_password_current_from_auth_change();

-- Keep the legacy signature during Stage A so old clients fail closed instead of
-- bypassing the Auth-backed trigger. Stage B removes the compatibility RPC.
create or replace function public.mark_password_changed()
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception using errcode = 'P0001', message = 'authentication required', detail = 'SQA_AUTH_REQUIRED';
  end if;
  select * into v_profile from public.profiles where id = auth.uid();
  if not found then
    raise exception using errcode = 'P0001', message = 'profile not found', detail = 'SQA_PROFILE_NOT_FOUND';
  end if;
  if v_profile.must_change_password then
    raise exception using
      errcode = 'P0001',
      message = 'password change has not been observed by Auth',
      detail = 'SQA_PASSWORD_CHANGE_NOT_OBSERVED';
  end if;
  return v_profile;
end;
$$;
revoke all on function public.mark_password_changed() from public, anon;
grant execute on function public.mark_password_changed() to authenticated;

create or replace function private.guard_profile_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception using
    errcode = 'P0001',
    message = 'profile deletion is blocked; deactivate the account instead',
    detail = 'SQA_PROFILE_DELETE_BLOCKED';
end;
$$;

revoke all on function private.guard_profile_delete() from public, anon, authenticated;
drop trigger if exists profiles_block_physical_delete on public.profiles;
create trigger profiles_block_physical_delete
before delete on public.profiles
for each row execute function private.guard_profile_delete();

create or replace function public.create_review_request(
  p_title text,
  p_description text,
  p_due_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request_id uuid;
begin
  if v_actor_id is null or not public.can_use_app()
    or public.current_user_role() is distinct from 'member'::public.app_role then
    raise exception using errcode = 'P0001', message = 'active member required', detail = 'SQA_ACTIVE_MEMBER_REQUIRED';
  end if;
  if p_title is null or char_length(btrim(p_title)) < 2
    or p_description is null or char_length(btrim(p_description)) < 2 then
    raise exception using errcode = 'P0001', message = 'title and description are required', detail = 'SQA_REVIEW_CONTENT_REQUIRED';
  end if;
  perform set_config('sqa.audit_reason', '검토요청 제출', true);
  perform set_config('sqa.audit_source', 'create_review_request', true);
  insert into public.review_requests (requester_id, title, description, due_date, status)
  values (v_actor_id, btrim(p_title), btrim(p_description), p_due_date, 'pending')
  returning id into v_request_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'review_request', v_request_id, 'created',
          (select name from public.profiles where id = v_actor_id) || '님이 ' || btrim(p_title) || ' 검토를 요청했습니다.',
          jsonb_build_object('due_date', p_due_date));
  return v_request_id;
end;
$$;

create or replace function public.update_review_request(
  p_review_request_id uuid,
  p_expected_updated_at timestamptz,
  p_title text,
  p_description text,
  p_due_date date
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.review_requests%rowtype;
  v_updated_at timestamptz;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  select * into v_request from public.review_requests where id = p_review_request_id for update;
  if not found or v_request.requester_id <> v_actor_id then
    raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND';
  end if;
  if v_request.status not in ('pending', 'rejected') then
    raise exception using errcode = 'P0001', message = 'review is not editable', detail = 'SQA_REVIEW_NOT_EDITABLE';
  end if;
  if p_expected_updated_at is null or v_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'review changed since it was opened', detail = 'SQA_REVIEW_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', '검토요청 내용 수정', true);
  perform set_config('sqa.audit_source', 'update_review_request', true);
  update public.review_requests
     set title = btrim(p_title), description = btrim(p_description), due_date = p_due_date,
         updated_at = clock_timestamp()
   where id = p_review_request_id
  returning updated_at into v_updated_at;
  return v_updated_at;
end;
$$;

create or replace function public.withdraw_review_request(
  p_review_request_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.review_requests%rowtype;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 2 then
    raise exception using errcode = 'P0001', message = 'withdrawal reason required', detail = 'SQA_REVIEW_WITHDRAW_REASON_REQUIRED';
  end if;
  select * into v_request from public.review_requests where id = p_review_request_id for update;
  if not found or v_request.requester_id <> v_actor_id then
    raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND';
  end if;
  if v_request.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'only pending reviews can be withdrawn', detail = 'SQA_REVIEW_NOT_WITHDRAWABLE';
  end if;
  if p_expected_updated_at is null or v_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'review changed since it was opened', detail = 'SQA_REVIEW_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', btrim(p_reason), true);
  perform set_config('sqa.audit_source', 'withdraw_review_request', true);
  update public.review_requests
     set status = 'withdrawn', withdrawn_by = v_actor_id, withdrawal_reason = btrim(p_reason),
         updated_at = clock_timestamp()
   where id = p_review_request_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'review_request', p_review_request_id, 'withdrawn',
          (select name from public.profiles where id = v_actor_id) || '님이 ' || v_request.title || ' 검토요청을 회수했습니다.',
          jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create or replace function public.approve_review_request(
  p_review_request_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.review_requests%rowtype;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  select * into v_request from public.review_requests where id = p_review_request_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception using errcode = 'P0001', message = 'review is not pending', detail = 'SQA_REVIEW_NOT_PENDING'; end if;
  if p_expected_updated_at is null or v_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'review changed since it was opened', detail = 'SQA_REVIEW_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', '검토 승인', true);
  perform set_config('sqa.audit_source', 'approve_review_request', true);
  update public.review_requests set status = 'approved', updated_at = clock_timestamp() where id = p_review_request_id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, v_request.requester_id, 'review_request', p_review_request_id, 'status_changed',
          v_request.title || ' 검토요청을 승인했습니다.', jsonb_build_object('status', 'approved'));
end;
$$;

create or replace function public.reject_review_request(
  p_review_request_id uuid,
  p_expected_updated_at timestamptz,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.review_requests%rowtype;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_comment is null or char_length(btrim(p_comment)) < 2 then
    raise exception using errcode = 'P0001', message = 'rejection reason required', detail = 'SQA_REVIEW_COMMENT_REQUIRED';
  end if;
  select * into v_request from public.review_requests where id = p_review_request_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND'; end if;
  if v_request.status <> 'pending' then raise exception using errcode = 'P0001', message = 'review is not pending', detail = 'SQA_REVIEW_NOT_PENDING'; end if;
  if p_expected_updated_at is null or v_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'review changed since it was opened', detail = 'SQA_REVIEW_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', btrim(p_comment), true);
  perform set_config('sqa.audit_source', 'reject_review_request', true);
  insert into public.review_feedback (review_request_id, leader_id, author_role, comment)
  values (p_review_request_id, v_actor_id, 'leader', btrim(p_comment));
  update public.review_requests
     set status = 'rejected', rejection_count = coalesce(rejection_count, 0) + 1,
         updated_at = clock_timestamp()
   where id = p_review_request_id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, v_request.requester_id, 'review_request', p_review_request_id, 'status_changed',
          v_request.title || ' 검토요청을 반려했습니다.', jsonb_build_object('status', 'rejected'));
end;
$$;

create or replace function public.reopen_review_request(
  p_review_request_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.review_requests%rowtype;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  select * into v_request from public.review_requests where id = p_review_request_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND'; end if;
  if v_request.status not in ('approved', 'rejected') then
    raise exception using errcode = 'P0001', message = 'review cannot be reopened', detail = 'SQA_REVIEW_NOT_REOPENABLE';
  end if;
  if p_expected_updated_at is null or v_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'review changed since it was opened', detail = 'SQA_REVIEW_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', '검토요청 다시 열기', true);
  perform set_config('sqa.audit_source', 'reopen_review_request', true);
  update public.review_requests set status = 'pending', updated_at = clock_timestamp() where id = p_review_request_id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, v_request.requester_id, 'review_request', p_review_request_id, 'reopened',
          v_request.title || ' 검토요청을 다시 열었습니다.', jsonb_build_object('from_status', v_request.status, 'status', 'pending'));
end;
$$;

create or replace function public.resubmit_review_request(
  p_review_request_id uuid,
  p_expected_updated_at timestamptz,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.review_requests%rowtype;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if p_comment is null or char_length(btrim(p_comment)) < 2 then
    raise exception using errcode = 'P0001', message = 'resubmission note required', detail = 'SQA_REVIEW_COMMENT_REQUIRED';
  end if;
  select * into v_request from public.review_requests where id = p_review_request_id for update;
  if not found or v_request.requester_id <> v_actor_id then
    raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND';
  end if;
  if v_request.status <> 'rejected' then
    raise exception using errcode = 'P0001', message = 'only rejected reviews can be resubmitted', detail = 'SQA_REVIEW_NOT_RESUBMITTABLE';
  end if;
  if p_expected_updated_at is null or v_request.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'review changed since it was opened', detail = 'SQA_REVIEW_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', btrim(p_comment), true);
  perform set_config('sqa.audit_source', 'resubmit_review_request', true);
  insert into public.review_feedback (review_request_id, leader_id, author_role, comment)
  values (p_review_request_id, v_actor_id, 'member', btrim(p_comment));
  update public.review_requests
     set status = 'pending', review_round = coalesce(review_round, 1) + 1,
         updated_at = clock_timestamp()
   where id = p_review_request_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'review_request', p_review_request_id, 'resubmitted',
          v_request.title || ' 검토를 다시 요청했습니다.',
          jsonb_build_object('from_status', 'rejected', 'status', 'pending', 'review_round', coalesce(v_request.review_round, 1) + 1));
end;
$$;

create or replace function public.update_review_feedback(
  p_feedback_id uuid,
  p_expected_updated_at timestamptz,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_feedback public.review_feedback%rowtype;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  select * into v_feedback from public.review_feedback where id = p_feedback_id for update;
  if not found or v_feedback.leader_id <> v_actor_id or v_feedback.author_role <> 'leader' then
    raise exception using errcode = 'P0001', message = 'feedback not found', detail = 'SQA_FEEDBACK_NOT_FOUND';
  end if;
  if v_feedback.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'voided feedback cannot be edited', detail = 'SQA_FEEDBACK_VOIDED';
  end if;
  if p_expected_updated_at is null or v_feedback.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'feedback changed since it was opened', detail = 'SQA_FEEDBACK_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', '검토 피드백 수정', true);
  perform set_config('sqa.audit_source', 'update_review_feedback', true);
  update public.review_feedback set comment = btrim(p_comment), updated_at = clock_timestamp() where id = p_feedback_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'review_feedback', p_feedback_id, 'updated', '검토 피드백을 수정했습니다.',
          jsonb_build_object('review_request_id', v_feedback.review_request_id));
end;
$$;

create or replace function public.void_review_feedback(
  p_feedback_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_feedback public.review_feedback%rowtype;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 2 then
    raise exception using errcode = 'P0001', message = 'void reason required', detail = 'SQA_FEEDBACK_VOID_REASON_REQUIRED';
  end if;
  select * into v_feedback from public.review_feedback where id = p_feedback_id for update;
  if not found or v_feedback.leader_id <> v_actor_id or v_feedback.author_role <> 'leader' then
    raise exception using errcode = 'P0001', message = 'feedback not found', detail = 'SQA_FEEDBACK_NOT_FOUND';
  end if;
  if v_feedback.voided_at is not null then
    raise exception using errcode = 'P0001', message = 'feedback already voided', detail = 'SQA_FEEDBACK_VOIDED';
  end if;
  if p_expected_updated_at is null or v_feedback.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'feedback changed since it was opened', detail = 'SQA_FEEDBACK_CONFLICT';
  end if;
  perform set_config('sqa.audit_reason', btrim(p_reason), true);
  perform set_config('sqa.audit_source', 'void_review_feedback', true);
  update public.review_feedback
     set voided_at = clock_timestamp(), voided_by = v_actor_id,
         void_reason = btrim(p_reason), updated_at = clock_timestamp()
   where id = p_feedback_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'review_feedback', p_feedback_id, 'voided', '검토 피드백을 무효화했습니다.',
          jsonb_build_object('review_request_id', v_feedback.review_request_id, 'reason', btrim(p_reason)));
end;
$$;

create or replace function public.mark_review_seen(p_review_request_id uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role;
  v_latest_event_id bigint;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  select role into v_role from public.profiles where id = v_actor_id;
  if not exists (
    select 1 from public.review_requests request
     where request.id = p_review_request_id
       and (v_role = 'leader' or request.requester_id = v_actor_id)
  ) then
    raise exception using errcode = 'P0001', message = 'review not found', detail = 'SQA_REVIEW_NOT_FOUND';
  end if;
  select max(event.id) into v_latest_event_id
    from public.review_events event
   where event.review_request_id = p_review_request_id
     and ((v_role = 'leader' and event.event_type in ('submitted', 'resubmitted'))
       or (v_role = 'member' and event.event_type in ('feedback_added', 'feedback_updated', 'feedback_voided', 'approved', 'rejected', 'reopened')));
  if v_latest_event_id is not null then
    insert into public.review_read_receipts (user_id, review_request_id, last_seen_event_id, read_at)
    values (v_actor_id, p_review_request_id, v_latest_event_id, clock_timestamp())
    on conflict (user_id, review_request_id) do update
      set last_seen_event_id = greatest(review_read_receipts.last_seen_event_id, excluded.last_seen_event_id),
          read_at = excluded.read_at;
  end if;
  return v_latest_event_id;
end;
$$;

create or replace function public.mark_all_relevant_reviews_seen()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_role public.app_role;
  v_count integer;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  select role into v_role from public.profiles where id = v_actor_id;
  insert into public.review_read_receipts (user_id, review_request_id, last_seen_event_id, read_at)
  select v_actor_id, event.review_request_id, max(event.id), clock_timestamp()
    from public.review_events event
    join public.review_requests request on request.id = event.review_request_id
   where (v_role = 'leader' or request.requester_id = v_actor_id)
     and ((v_role = 'leader' and event.event_type in ('submitted', 'resubmitted'))
       or (v_role = 'member' and event.event_type in ('feedback_added', 'feedback_updated', 'feedback_voided', 'approved', 'rejected', 'reopened')))
   group by event.review_request_id
  on conflict (user_id, review_request_id) do update
    set last_seen_event_id = greatest(review_read_receipts.last_seen_event_id, excluded.last_seen_event_id),
        read_at = excluded.read_at;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_review_statistics(
  p_from date,
  p_to date,
  p_requester_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_from is null or p_to is null or p_from > p_to or p_to - p_from > 366 then
    raise exception using errcode = 'P0001', message = 'invalid statistics range', detail = 'SQA_STATS_RANGE_INVALID';
  end if;
  select jsonb_build_object(
    'new_requests', count(*) filter (where event.event_type = 'submitted'),
    'resubmissions', count(*) filter (where event.event_type = 'resubmitted'),
    'approvals', count(*) filter (where event.event_type = 'approved'),
    'rejections', count(*) filter (where event.event_type = 'rejected'),
    'reopened', count(*) filter (where event.event_type = 'reopened'),
    'estimated_events', count(*) filter (where coalesce((event.metadata ->> 'estimated')::boolean, false)),
    'from', p_from,
    'to', p_to
  ) into v_result
    from public.review_events event
    join public.review_requests request on request.id = event.review_request_id
   where event.occurred_at >= p_from::timestamptz
     and event.occurred_at < (p_to + 1)::timestamptz
     and event.event_type <> 'withdrawn'
     and (p_requester_id is null or request.requester_id = p_requester_id);
  return coalesce(v_result, '{}'::jsonb);
end;
$$;

revoke all on function public.create_review_request(text, text, date) from public, anon, authenticated;
revoke all on function public.update_review_request(uuid, timestamptz, text, text, date) from public, anon, authenticated;
revoke all on function public.withdraw_review_request(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.approve_review_request(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.reject_review_request(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.reopen_review_request(uuid, timestamptz) from public, anon, authenticated;
revoke all on function public.resubmit_review_request(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.update_review_feedback(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.void_review_feedback(uuid, timestamptz, text) from public, anon, authenticated;
revoke all on function public.mark_review_seen(uuid) from public, anon, authenticated;
revoke all on function public.mark_all_relevant_reviews_seen() from public, anon, authenticated;
revoke all on function public.get_review_statistics(date, date, uuid) from public, anon, authenticated;

grant execute on function public.create_review_request(text, text, date) to authenticated;
grant execute on function public.update_review_request(uuid, timestamptz, text, text, date) to authenticated;
grant execute on function public.withdraw_review_request(uuid, timestamptz, text) to authenticated;
grant execute on function public.approve_review_request(uuid, timestamptz) to authenticated;
grant execute on function public.reject_review_request(uuid, timestamptz, text) to authenticated;
grant execute on function public.reopen_review_request(uuid, timestamptz) to authenticated;
grant execute on function public.resubmit_review_request(uuid, timestamptz, text) to authenticated;
grant execute on function public.update_review_feedback(uuid, timestamptz, text) to authenticated;
grant execute on function public.void_review_feedback(uuid, timestamptz, text) to authenticated;
grant execute on function public.mark_review_seen(uuid) to authenticated;
grant execute on function public.mark_all_relevant_reviews_seen() to authenticated;
grant execute on function public.get_review_statistics(date, date, uuid) to authenticated;

comment on table public.review_events is 'Compact authoritative review-domain events; never stores full review bodies.';
comment on table public.review_read_receipts is 'Server-time per-review read receipts used across browsers and devices.';
comment on function public.withdraw_review_request(uuid, timestamptz, text) is 'Soft-withdraws an owned pending request with OCC and a required reason.';
comment on function public.mark_review_seen(uuid) is 'Advances only the caller relevant events for one review using database time.';
