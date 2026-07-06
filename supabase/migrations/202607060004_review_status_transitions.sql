-- Enforce review status transitions: pending -> approved/rejected only.

create or replace function public.update_review_request_status(
  p_review_request_id uuid,
  p_status public.review_status
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status public.review_status;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if p_status = 'rejected' then
    raise exception 'use reject_review_request for rejected status';
  end if;

  select status
    into v_current_status
    from public.review_requests
   where id = p_review_request_id
   for update;

  if v_current_status is null then
    raise exception 'review request not found';
  end if;

  if v_current_status <> 'pending' then
    raise exception 'only pending review requests can be approved';
  end if;

  if p_status <> 'approved' then
    raise exception 'unsupported status transition';
  end if;

  update public.review_requests
     set status = p_status
   where id = p_review_request_id;
end;
$$;

create or replace function public.reject_review_request(
  p_review_request_id uuid,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_status public.review_status;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if btrim(coalesce(p_comment, '')) = '' then
    raise exception 'comment is required';
  end if;

  select status
    into v_current_status
    from public.review_requests
   where id = p_review_request_id
   for update;

  if v_current_status is null then
    raise exception 'review request not found';
  end if;

  if v_current_status <> 'pending' then
    raise exception 'only pending review requests can be rejected';
  end if;

  insert into public.review_feedback (review_request_id, leader_id, comment)
  values (p_review_request_id, auth.uid(), btrim(p_comment));

  update public.review_requests
     set status = 'rejected'
   where id = p_review_request_id;
end;
$$;
