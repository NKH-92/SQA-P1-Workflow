-- Authoritative, transaction-bound mutation trail. Client activity_logs remains UX
-- telemetry during transition; authenticated users receive no access to this schema.

create schema if not exists private;

create table if not exists private.audit_events (
  id bigint generated always as identity primary key,
  entity_type text not null,
  entity_id uuid,
  action text not null check (action in ('inserted', 'updated', 'deleted')),
  actor_id uuid,
  actor_name text,
  transaction_id bigint not null,
  changed_at timestamptz not null default now()
);

create index if not exists private_audit_events_changed_at_idx
  on private.audit_events(changed_at desc);
create index if not exists private_audit_events_entity_idx
  on private.audit_events(entity_type, entity_id, changed_at desc);

revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;
revoke all on table private.audit_events from public;
revoke all on table private.audit_events from anon;
revoke all on table private.audit_events from authenticated;

create or replace function private.record_mutation_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, pg_temp
as $$
declare
  v_row jsonb;
  v_actor_id uuid := auth.uid();
  v_actor_name text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;
  insert into private.audit_events (
    entity_type,
    entity_id,
    action,
    actor_id,
    actor_name,
    transaction_id
  ) values (
    tg_argv[0],
    nullif(v_row ->> 'id', '')::uuid,
    case tg_op
      when 'INSERT' then 'inserted'
      when 'UPDATE' then 'updated'
      when 'DELETE' then 'deleted'
    end,
    v_actor_id,
    v_actor_name,
    txid_current()
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.record_mutation_audit() from public;
revoke all on function private.record_mutation_audit() from anon;
revoke all on function private.record_mutation_audit() from authenticated;

drop trigger if exists profiles_private_audit on public.profiles;
create trigger profiles_private_audit after insert or update or delete on public.profiles
for each row execute function private.record_mutation_audit('profile');

drop trigger if exists allowed_users_private_audit on public.allowed_users;
create trigger allowed_users_private_audit after insert or update or delete on public.allowed_users
for each row execute function private.record_mutation_audit('allowed_user');

drop trigger if exists products_private_audit on public.products;
create trigger products_private_audit after insert or update or delete on public.products
for each row execute function private.record_mutation_audit('product');

drop trigger if exists product_assignments_private_audit on public.product_assignments;
create trigger product_assignments_private_audit after insert or update or delete on public.product_assignments
for each row execute function private.record_mutation_audit('product_assignment');

drop trigger if exists duty_major_categories_private_audit on public.duty_major_categories;
create trigger duty_major_categories_private_audit after insert or update or delete on public.duty_major_categories
for each row execute function private.record_mutation_audit('duty_major_category');

drop trigger if exists duties_private_audit on public.duties;
create trigger duties_private_audit after insert or update or delete on public.duties
for each row execute function private.record_mutation_audit('duty');

drop trigger if exists duty_assignments_private_audit on public.duty_assignments;
create trigger duty_assignments_private_audit after insert or update or delete on public.duty_assignments
for each row execute function private.record_mutation_audit('duty_assignment');

drop trigger if exists review_requests_private_audit on public.review_requests;
create trigger review_requests_private_audit after insert or update or delete on public.review_requests
for each row execute function private.record_mutation_audit('review_request');

drop trigger if exists review_feedback_private_audit on public.review_feedback;
create trigger review_feedback_private_audit after insert or update or delete on public.review_feedback
for each row execute function private.record_mutation_audit('review_feedback');

drop trigger if exists projects_private_audit on public.projects;
create trigger projects_private_audit after insert or update or delete on public.projects
for each row execute function private.record_mutation_audit('project');

drop trigger if exists project_assignments_private_audit on public.project_assignments;
create trigger project_assignments_private_audit after insert or update or delete on public.project_assignments
for each row execute function private.record_mutation_audit('project_assignment');
