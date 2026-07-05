-- Collapse in_review into pending; leaders now approve or reject directly from pending.

drop policy if exists "review_requests_insert_self_pending" on public.review_requests;
drop policy if exists "review_requests_update_self_pending" on public.review_requests;
drop policy if exists "review_requests_delete_self_pending" on public.review_requests;

update public.review_requests
   set status = 'pending'
 where status = 'in_review';

alter type public.review_status rename to review_status_old;

create type public.review_status as enum ('pending', 'approved', 'rejected');

alter table public.review_requests
  alter column status drop default,
  alter column status type public.review_status
    using status::text::public.review_status;

alter table public.review_requests
  alter column status set default 'pending';

drop type public.review_status_old;

create policy "review_requests_insert_self_pending"
on public.review_requests for insert
to authenticated
with check (
  public.can_use_app()
  and requester_id = auth.uid()
  and status = 'pending'
);

create policy "review_requests_update_self_pending"
on public.review_requests for update
to authenticated
using (public.can_use_app() and requester_id = auth.uid() and status = 'pending')
with check (public.can_use_app() and requester_id = auth.uid() and status = 'pending');

create policy "review_requests_delete_self_pending"
on public.review_requests for delete
to authenticated
using (public.can_use_app() and requester_id = auth.uid() and status = 'pending');

create or replace function public.add_review_feedback(
  p_review_request_id uuid,
  p_comment text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_feedback_id uuid;
  v_status public.review_status;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if btrim(coalesce(p_comment, '')) = '' then
    raise exception 'comment is required';
  end if;

  select status
    into v_status
    from public.review_requests
   where id = p_review_request_id;

  if v_status is null then
    raise exception 'review request not found';
  end if;

  insert into public.review_feedback (review_request_id, leader_id, comment)
  values (p_review_request_id, auth.uid(), btrim(p_comment))
  returning id into v_feedback_id;

  return v_feedback_id;
end;
$$;
