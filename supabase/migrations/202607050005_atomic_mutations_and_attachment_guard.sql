-- Atomic review/project mutations and storage attachment URL ownership guard.

create or replace function public.validate_review_attachment_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  storage_prefix constant text := 'storage://review-attachments/';
  path_part text;
begin
  if new.attachment_url is null or btrim(new.attachment_url) = '' then
    return new;
  end if;

  if new.attachment_url not like storage_prefix || '%' then
    return new;
  end if;

  path_part := substring(new.attachment_url from char_length(storage_prefix) + 1);
  if split_part(path_part, '/', 1) <> auth.uid()::text then
    raise exception 'attachment path must belong to the current user';
  end if;

  return new;
end;
$$;

drop trigger if exists review_requests_validate_attachment on public.review_requests;
create trigger review_requests_validate_attachment
before insert or update of attachment_url on public.review_requests
for each row execute function public.validate_review_attachment_url();

create or replace function public.reject_review_request(
  p_review_request_id uuid,
  p_comment text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if btrim(coalesce(p_comment, '')) = '' then
    raise exception 'comment is required';
  end if;

  insert into public.review_feedback (review_request_id, leader_id, comment)
  values (p_review_request_id, auth.uid(), btrim(p_comment));

  update public.review_requests
     set status = 'rejected'
   where id = p_review_request_id;
end;
$$;

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

  if v_status = 'pending' then
    update public.review_requests
       set status = 'in_review'
     where id = p_review_request_id;
  end if;

  return v_feedback_id;
end;
$$;

create or replace function public.create_project_with_assignments(
  p_name text,
  p_description text,
  p_deadline date,
  p_status public.project_status,
  p_member_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_id uuid;
  v_member_id uuid;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  insert into public.projects (name, description, deadline, status, created_by)
  values (p_name, coalesce(p_description, ''), p_deadline, p_status, auth.uid())
  returning id into v_project_id;

  if p_member_ids is not null then
    foreach v_member_id in array p_member_ids loop
      insert into public.project_assignments (project_id, user_id, notes)
      values (v_project_id, v_member_id, null);
    end loop;
  end if;

  return v_project_id;
end;
$$;

revoke all on function public.reject_review_request(uuid, text) from public;
grant execute on function public.reject_review_request(uuid, text) to authenticated;

revoke all on function public.add_review_feedback(uuid, text) from public;
grant execute on function public.add_review_feedback(uuid, text) to authenticated;

revoke all on function public.create_project_with_assignments(text, text, date, public.project_status, uuid[]) from public;
grant execute on function public.create_project_with_assignments(text, text, date, public.project_status, uuid[]) to authenticated;
