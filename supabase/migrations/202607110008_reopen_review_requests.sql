-- P1-5: give active leaders an audited, transactional correction path for closed reviews.
-- Closed feedback is retained when a request is reopened so the history remains visible.

create or replace function public.reopen_review_request(
  p_review_request_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current_status public.review_status;
  v_requester_id uuid;
  v_title text;
  v_actor_name text;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  select status, requester_id, title
    into v_current_status, v_requester_id, v_title
    from public.review_requests
   where id = p_review_request_id
   for update;

  if not found then
    raise exception 'review request not found';
  end if;

  if v_current_status not in ('approved'::public.review_status, 'rejected'::public.review_status) then
    raise exception 'only approved or rejected review requests can be reopened';
  end if;

  select name
    into v_actor_name
    from public.profiles
   where id = auth.uid();

  update public.review_requests
     set status = 'pending'
   where id = p_review_request_id;

  -- This is deliberately server-side: the status transition and its user-facing
  -- activity log commit (or roll back) together. private.review_status_events is
  -- populated by the status trigger from migration 202607110004.
  insert into public.activity_logs (
    actor_id,
    target_user_id,
    entity_type,
    entity_id,
    action,
    summary,
    metadata
  ) values (
    auth.uid(),
    v_requester_id,
    'review_request',
    p_review_request_id,
    'reopened',
    coalesce(v_actor_name, 'Leader') || ' reopened ' || coalesce(v_title, 'review request'),
    jsonb_build_object('from_status', v_current_status::text, 'status', 'pending')
  );
end;
$$;

revoke all on function public.reopen_review_request(uuid) from public;
revoke all on function public.reopen_review_request(uuid) from anon;
revoke all on function public.reopen_review_request(uuid) from authenticated;
grant execute on function public.reopen_review_request(uuid) to authenticated;

-- Feedback corrections may change only the comment. Leader/requester ownership and
-- request linkage are not writable through the Data API, preventing reassignment.
revoke update on table public.review_feedback from authenticated;
grant update (comment) on table public.review_feedback to authenticated;
