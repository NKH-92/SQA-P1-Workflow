-- P1-4: make review status/feedback activity logs part of the same transaction
-- as the authoritative SECURITY DEFINER mutation RPC.

create or replace function public.update_review_request_status(
  p_review_request_id uuid,
  p_status public.review_status
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
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_active_leader() then raise exception 'permission denied'; end if;
  if p_status = 'rejected' then raise exception 'use reject_review_request for rejected status'; end if;

  select status, requester_id, title into v_current_status, v_requester_id, v_title
    from public.review_requests where id = p_review_request_id for update;
  if not found then raise exception 'review request not found'; end if;
  if v_current_status is distinct from 'pending' or p_status is distinct from 'approved' then
    raise exception 'only pending review requests can be approved';
  end if;

  select name into v_actor_name from public.profiles where id = auth.uid();
  update public.review_requests
     set status = p_status
   where id = p_review_request_id
     and status = 'pending'
   returning status into v_current_status;
  if not found then raise exception 'review request status changed'; end if;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (auth.uid(), v_requester_id, 'review_request', p_review_request_id, 'status_changed',
          coalesce(v_actor_name, 'Leader') || ' approved ' || coalesce(v_title, 'review request'),
          jsonb_build_object('status', p_status::text));
end;
$$;

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
  v_current_status public.review_status;
  v_requester_id uuid;
  v_title text;
  v_actor_name text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_active_leader() then raise exception 'permission denied'; end if;
  if p_comment is null or p_comment !~ '[^[:space:]]' or length(p_comment) > 2000 then raise exception 'comment is invalid'; end if;

  select status, requester_id, title into v_current_status, v_requester_id, v_title
    from public.review_requests where id = p_review_request_id for update;
  if not found then raise exception 'review request not found'; end if;
  if v_current_status is distinct from 'pending' then raise exception 'only pending review requests can be rejected'; end if;

  select name into v_actor_name from public.profiles where id = auth.uid();
  insert into public.review_feedback (review_request_id, leader_id, comment)
  values (p_review_request_id, auth.uid(), btrim(p_comment));
  update public.review_requests
     set status = 'rejected'
   where id = p_review_request_id
     and status = 'pending'
   returning status into v_current_status;
  if not found then raise exception 'review request status changed'; end if;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (auth.uid(), v_requester_id, 'review_request', p_review_request_id, 'status_changed',
          coalesce(v_actor_name, 'Leader') || ' rejected ' || coalesce(v_title, 'review request'),
          jsonb_build_object('status', 'rejected', 'feedback', btrim(p_comment)));
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
  v_feedback_id uuid;
  v_requester_id uuid;
  v_title text;
  v_actor_name text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.is_active_leader() then raise exception 'permission denied'; end if;
  if p_comment is null or p_comment !~ '[^[:space:]]' or length(p_comment) > 2000 then raise exception 'comment is invalid'; end if;
  select requester_id, title into v_requester_id, v_title
    from public.review_requests where id = p_review_request_id for update;
  if not found then raise exception 'review request not found'; end if;

  select name into v_actor_name from public.profiles where id = auth.uid();
  insert into public.review_feedback (review_request_id, leader_id, comment)
  values (p_review_request_id, auth.uid(), btrim(p_comment)) returning id into v_feedback_id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (auth.uid(), v_requester_id, 'review_feedback', v_feedback_id, 'created',
          coalesce(v_actor_name, 'Leader') || ' added feedback to ' || coalesce(v_title, 'review request'),
          jsonb_build_object('review_request_id', p_review_request_id));
  return v_feedback_id;
end;
$$;

revoke all on function public.update_review_request_status(uuid, public.review_status) from public;
revoke all on function public.update_review_request_status(uuid, public.review_status) from anon, authenticated;
grant execute on function public.update_review_request_status(uuid, public.review_status) to authenticated;
revoke all on function public.reject_review_request(uuid, text) from public;
revoke all on function public.reject_review_request(uuid, text) from anon, authenticated;
grant execute on function public.reject_review_request(uuid, text) to authenticated;
revoke all on function public.add_review_feedback(uuid, text) from public;
revoke all on function public.add_review_feedback(uuid, text) from anon, authenticated;
grant execute on function public.add_review_feedback(uuid, text) to authenticated;
