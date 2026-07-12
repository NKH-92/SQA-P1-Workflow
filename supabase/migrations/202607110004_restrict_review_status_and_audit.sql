-- Review status is RPC-only; normal edits remain column-scoped direct updates.
-- Record every committed status change in a non-API private audit table.

revoke update on table public.review_requests from authenticated;
grant update (title, description, attachment_url, due_date) on table public.review_requests to authenticated;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

create table if not exists private.review_status_events (
  id bigint generated always as identity primary key,
  review_request_id uuid not null,
  actor_id uuid,
  actor_name text,
  from_status public.review_status not null,
  to_status public.review_status not null,
  transaction_id bigint not null,
  changed_at timestamptz not null default now()
);

revoke all on table private.review_status_events from public;
revoke all on table private.review_status_events from anon;
revoke all on table private.review_status_events from authenticated;

create or replace function private.record_review_status_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
begin
  select name into v_actor_name from public.profiles where id = v_actor_id;
  insert into private.review_status_events (
    review_request_id,
    actor_id,
    actor_name,
    from_status,
    to_status,
    transaction_id
  ) values (
    new.id,
    v_actor_id,
    v_actor_name,
    old.status,
    new.status,
    txid_current()
  );
  return new;
end;
$$;

revoke all on function private.record_review_status_event() from public;
revoke all on function private.record_review_status_event() from anon;
revoke all on function private.record_review_status_event() from authenticated;

drop trigger if exists review_requests_record_status_event on public.review_requests;
create trigger review_requests_record_status_event
after update of status on public.review_requests
for each row
when (old.status is distinct from new.status)
execute function private.record_review_status_event();
