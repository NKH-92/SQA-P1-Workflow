-- Align review create/update input limits with the shared UI/local validator.
-- The column-scoped trigger deliberately validates INSERTs and content fields
-- that actually change. This preserves status-only lifecycle updates for legacy
-- rows that predate the v2 limits. A later, data-cleanup migration may add and
-- validate CHECK constraints after the production distribution is known.

create or replace function private.validate_review_request_input_v2()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.title is distinct from old.title then
    new.title := regexp_replace(new.title, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if new.title is null or char_length(new.title) not between 2 and 200 then
      raise exception using
        errcode = 'P0001',
        message = 'review title is invalid',
        detail = 'SQA_REVIEW_TITLE_INVALID';
    end if;
  end if;

  if tg_op = 'INSERT' or new.description is distinct from old.description then
    new.description := regexp_replace(new.description, '^[[:space:]]+|[[:space:]]+$', '', 'g');
    if new.description is null or char_length(new.description) not between 2 and 20000 then
      raise exception using
        errcode = 'P0001',
        message = 'review description is invalid',
        detail = 'SQA_REVIEW_DESCRIPTION_INVALID';
    end if;
  end if;

  if new.due_date is not null
    and new.due_date < private.sqa_business_date(clock_timestamp())
    and (tg_op = 'INSERT' or new.due_date is distinct from old.due_date) then
    raise exception using
      errcode = 'P0001',
      message = 'review due date is in the past',
      detail = 'SQA_REVIEW_DUE_DATE_PAST';
  end if;
  return new;
end;
$$;

-- Stage B revokes future private routine EXECUTE from service_role. The trigger
-- remains SECURITY INVOKER, so the operational client needs only this pure KST
-- date helper; the validator itself is never exposed as a callable API.
grant execute on function private.sqa_business_date(timestamptz) to service_role;
revoke all on function private.validate_review_request_input_v2() from public, anon, authenticated, service_role;

drop trigger if exists review_request_input_v2_guard on public.review_requests;
create trigger review_request_input_v2_guard
before insert or update of title, description, due_date
on public.review_requests
for each row execute function private.validate_review_request_input_v2();

comment on function private.validate_review_request_input_v2() is
  'Shared review input boundary for INSERTs and changed content: title 2..200, description 2..20000, no newly assigned past KST due date; untouched legacy content remains lifecycle-updatable.';
