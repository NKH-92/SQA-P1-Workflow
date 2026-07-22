-- Optimistic concurrency control (OCC) and authoritative change reasons
-- for important master data: products, duties, duty major categories,
-- invites (allowed_users), and profile active-state toggles.
--
-- Problem: update_product/update_duty/update_duty_major_category/update_invite/
-- toggleProfileActive all issued a bare `eq(id)` PostgREST UPDATE with no
-- expected-revision check. Two leaders editing the same record concurrently
-- silently lost-update one another, and the authoritative private audit
-- (private.audit_events) recorded no human-authored `reason` for the change
-- because nothing ever called `set_config('sqa.audit_reason', ...)` on these
-- paths.
--
-- This migration adds `_if_current` RPCs (mirroring the
-- `update_product_if_current` contract and the existing
-- `replace_project_assignments_if_current` precedent from
-- 202607110007_serialize_project_assignment_replace.sql) for:
--   Master updates: update_product_if_current, update_duty_major_category_if_current,
--           update_duty_if_current
--   Access updates: update_allowed_user_if_current, set_profile_active_if_current
--           (last-active-leader invariant is enforced by the existing
--           guard_last_active_leader_profile/_allowed_user triggers, unchanged)
--   Assignment updates: replace_product_assignments_if_current,
--           replace_duty_assignments_if_current
--
-- Every _if_current RPC: requires an active leader, requires and validates a
-- non-blank `p_reason`, locks the row `for update`, compares
-- `updated_at` against the caller-supplied `p_expected_updated_at`, raises a
-- stable `SQA_MASTER_STALE` detail on mismatch, raises `SQA_MASTER_NOT_FOUND`
-- when the row does not exist (0-row case, distinct from stale), records the
-- reason/source/correlation id via `sqa.audit_*` session settings so
-- `private.record_mutation_audit()` captures them, and skips the actual
-- UPDATE statement entirely when nothing would change (no-op: no revision
-- bump, no audit row, but still a successful return of the current
-- revision) -- distinct from the not-found and stale cases.
--
-- Existing deployed write paths remain available during this expand release.
-- The legacy void RPCs
-- (replace_product_assignments, replace_product_assignments_with_reason,
-- replace_duty_assignments) and direct-table writes remain a compatibility
-- surface for the currently deployed client and already-open browser tabs.
-- Their retirement belongs in a later contract migration, after the Worker
-- using these OCC RPCs has been deployed and verified. This also makes every
-- committed migration prefix safe if a later migration fails to apply.

-- ---------------------------------------------------------------------------
-- Schema: allowed_users needs an updated_at revision column for OCC. Every
-- other OCC-protected entity (products, duties, duty_major_categories, profiles)
-- already has one with a `set_updated_at` trigger.
-- ---------------------------------------------------------------------------

alter table public.allowed_users
  add column if not exists updated_at timestamptz;

update public.allowed_users set updated_at = created_at where updated_at is null;

alter table public.allowed_users
  alter column updated_at set default now(),
  alter column updated_at set not null;

drop trigger if exists allowed_users_set_updated_at on public.allowed_users;
create trigger allowed_users_set_updated_at
before update on public.allowed_users
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Product / duty / duty major category update OCC
-- ---------------------------------------------------------------------------

create or replace function public.update_product_if_current(
  p_product_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_category text,
  p_company_name text,
  p_unassigned_reason text,
  p_sort_order integer,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_category text := coalesce(nullif(btrim(coalesce(p_category, '')), ''), '자사');
  v_company_name text := btrim(coalesce(p_company_name, ''));
  v_unassigned_reason text := nullif(btrim(coalesce(p_unassigned_reason, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_has_assignment boolean;
  v_changed boolean;
  v_updated_at timestamptz;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if char_length(v_name) not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'product name is invalid', detail = 'SQA_PRODUCT_NAME_INVALID';
  end if;
  if v_category not in ('자사', '위탁') then
    raise exception using errcode = 'P0001', message = 'product category is invalid', detail = 'SQA_PRODUCT_CATEGORY_INVALID';
  end if;
  if v_unassigned_reason is not null and char_length(v_unassigned_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'unassigned reason must be 1000 characters or fewer', detail = 'SQA_UNASSIGNED_REASON_TOO_LONG';
  end if;

  select * into v_product from public.products where id = p_product_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_product.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  select exists(select 1 from public.product_assignments where product_id = p_product_id) into v_has_assignment;
  if v_has_assignment then
    v_unassigned_reason := null;
  end if;

  v_changed :=
    v_product.name is distinct from v_name
    or v_product.category is distinct from v_category
    or v_product.company_name is distinct from v_company_name
    or v_product.unassigned_reason is distinct from v_unassigned_reason
    or v_product.sort_order is distinct from p_sort_order;

  if not v_changed then
    return v_product.updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'update_product_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  update public.products
     set name = v_name,
         category = v_category,
         company_name = v_company_name,
         unassigned_reason = v_unassigned_reason,
         sort_order = p_sort_order
   where id = p_product_id
   returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

create or replace function public.update_duty_major_category_if_current(
  p_major_category_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_sort_order integer,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_category public.duty_major_categories%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed boolean;
  v_updated_at timestamptz;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if char_length(v_name) not between 1 and 100 then
    raise exception using errcode = 'P0001', message = 'duty major category name is invalid', detail = 'SQA_DUTY_CATEGORY_NAME_INVALID';
  end if;

  select * into v_category from public.duty_major_categories where id = p_major_category_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_category.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  v_changed :=
    v_category.name is distinct from v_name
    or v_category.sort_order is distinct from p_sort_order;

  if not v_changed then
    return v_category.updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'update_duty_major_category_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  update public.duty_major_categories
     set name = v_name,
         sort_order = p_sort_order
   where id = p_major_category_id
   returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

create or replace function public.update_duty_if_current(
  p_duty_id uuid,
  p_expected_updated_at timestamptz,
  p_name text,
  p_major_category_id uuid,
  p_sort_order integer,
  p_assignee_label text,
  p_notes text,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_duty public.duties%rowtype;
  v_name text := btrim(coalesce(p_name, ''));
  v_assignee_label text := nullif(btrim(coalesce(p_assignee_label, '')), '');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed boolean;
  v_updated_at timestamptz;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if char_length(v_name) not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'duty name is invalid', detail = 'SQA_DUTY_NAME_INVALID';
  end if;
  if p_major_category_id is null then
    raise exception using errcode = 'P0001', message = 'duty major category is required', detail = 'SQA_DUTY_CATEGORY_REQUIRED';
  end if;

  select * into v_duty from public.duties where id = p_duty_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_duty.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  v_changed :=
    v_duty.name is distinct from v_name
    or v_duty.major_category_id is distinct from p_major_category_id
    or v_duty.sort_order is distinct from p_sort_order
    or v_duty.assignee_label is distinct from v_assignee_label
    or v_duty.notes is distinct from v_notes;

  if not v_changed then
    return v_duty.updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'update_duty_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  update public.duties
     set name = v_name,
         major_category_id = p_major_category_id,
         sort_order = p_sort_order,
         assignee_label = v_assignee_label,
         notes = v_notes
   where id = p_duty_id
   returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

revoke all on function public.update_product_if_current(uuid, timestamptz, text, text, text, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.update_product_if_current(uuid, timestamptz, text, text, text, text, integer, text, uuid) to authenticated;

revoke all on function public.update_duty_major_category_if_current(uuid, timestamptz, text, integer, text, uuid) from public, anon, authenticated;
grant execute on function public.update_duty_major_category_if_current(uuid, timestamptz, text, integer, text, uuid) to authenticated;

revoke all on function public.update_duty_if_current(uuid, timestamptz, text, uuid, integer, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.update_duty_if_current(uuid, timestamptz, text, uuid, integer, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invite (allowed_users) and profile active-state OCC. The
-- last-active-leader invariant continues to be enforced by
-- guard_last_active_leader_profile / guard_last_active_leader_allowed_user
-- (202607070005 / 202607110006), which fire on the plain UPDATE statements
-- below unchanged.
-- ---------------------------------------------------------------------------

create or replace function public.update_allowed_user_if_current(
  p_allowed_user_id uuid,
  p_expected_updated_at timestamptz,
  p_email text,
  p_name text,
  p_role public.app_role,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.allowed_users%rowtype;
  v_email public.allowed_users.email%type := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed boolean;
  v_updated_at timestamptz;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if char_length(v_name) not between 1 and 200 then
    raise exception using errcode = 'P0001', message = 'invite name is invalid', detail = 'SQA_INVITE_NAME_INVALID';
  end if;
  if v_email = '' or v_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception using errcode = 'P0001', message = 'invite email is invalid', detail = 'SQA_INVITE_EMAIL_INVALID';
  end if;
  if p_role is null then
    raise exception using errcode = 'P0001', message = 'invite role is required', detail = 'SQA_INVITE_ROLE_REQUIRED';
  end if;

  select * into v_invite from public.allowed_users where id = p_allowed_user_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_invite.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  v_changed :=
    v_invite.email is distinct from v_email
    or v_invite.name is distinct from v_name
    or v_invite.role is distinct from p_role;

  if not v_changed then
    return v_invite.updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'update_allowed_user_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  update public.allowed_users
     set email = v_email,
         name = v_name,
         role = p_role
   where id = p_allowed_user_id
   returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

create or replace function public.set_profile_active_if_current(
  p_profile_id uuid,
  p_expected_updated_at timestamptz,
  p_is_active boolean,
  p_reason text,
  p_correlation_id uuid default null
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_updated_at timestamptz;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is null then
    raise exception using errcode = 'P0001', message = 'change reason is required', detail = 'SQA_REASON_REQUIRED';
  end if;
  if char_length(v_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'change reason must be 500 characters or fewer', detail = 'SQA_REASON_TOO_LONG';
  end if;
  if p_is_active is null then
    raise exception using errcode = 'P0001', message = 'active state is required', detail = 'SQA_PROFILE_ACTIVE_REQUIRED';
  end if;

  select * into v_profile from public.profiles where id = p_profile_id for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_profile.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  if v_profile.is_active is not distinct from p_is_active then
    return v_profile.updated_at;
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'set_profile_active_if_current', true);
  if p_correlation_id is not null then
    perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true);
  end if;

  -- guard_last_active_leader_profile (before update trigger) still enforces
  -- the last-active-leader invariant and self-deactivation block unchanged.
  update public.profiles
     set is_active = p_is_active
   where id = p_profile_id
   returning updated_at into v_updated_at;

  return v_updated_at;
end;
$$;

revoke all on function public.update_allowed_user_if_current(uuid, timestamptz, text, text, public.app_role, text, uuid) from public, anon, authenticated;
grant execute on function public.update_allowed_user_if_current(uuid, timestamptz, text, text, public.app_role, text, uuid) to authenticated;

revoke all on function public.set_profile_active_if_current(uuid, timestamptz, boolean, text, uuid) from public, anon, authenticated;
grant execute on function public.set_profile_active_if_current(uuid, timestamptz, boolean, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Product / duty assignment replacement revision. Mirrors
-- replace_project_assignments_if_current (202607110007): expected revision,
-- `for update`, bump the parent revision after the replace so a second editor
-- holding the same stale snapshot fails instead of silently discarding
-- another leader's concurrent add/remove.
-- ---------------------------------------------------------------------------

create or replace function public.replace_product_assignments_if_current(
  p_product_id uuid,
  p_member_ids uuid[],
  p_unassigned_reason text,
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_member_ids uuid[] := coalesce(p_member_ids, array[]::uuid[]);
  v_reason text := nullif(btrim(coalesce(p_unassigned_reason, '')), '');
  v_current_updated_at timestamptz;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;
  if v_reason is not null and char_length(v_reason) > 1000 then
    raise exception using errcode = 'P0001', message = 'unassigned reason must be 1000 characters or fewer', detail = 'SQA_UNASSIGNED_REASON_TOO_LONG';
  end if;

  select updated_at into v_current_updated_at from public.products where id = p_product_id for update;
  if v_current_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  -- The client only ever supplies the desired end-state member list, never a
  -- stale copy of another leader's mid-flight edit -- the expected-revision
  -- check above already rejects that. Add/remove is computed against the
  -- current row set inside this same locked transaction, so a concurrent
  -- try_add_product_assignment that landed between snapshot and save is
  -- preserved unless it is explicitly absent from p_member_ids.
  delete from public.product_assignments
   where product_id = p_product_id
     and user_id <> all(v_member_ids);

  foreach v_member_id in array v_member_ids loop
    if v_member_id is null then
      raise exception using errcode = 'P0001', message = 'product assignment user is required', detail = 'SQA_ASSIGNMENT_USER_REQUIRED';
    end if;
    insert into public.product_assignments (product_id, user_id)
    values (p_product_id, v_member_id)
    on conflict (user_id, product_id) do nothing;
  end loop;

  update public.products
     set unassigned_reason = case when cardinality(v_member_ids) = 0 then v_reason else null end,
         updated_at = clock_timestamp()
   where id = p_product_id
   returning updated_at into v_current_updated_at;

  return v_current_updated_at;
end;
$$;

create or replace function public.replace_duty_assignments_if_current(
  p_duty_id uuid,
  p_member_ids uuid[],
  p_expected_updated_at timestamptz
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member_id uuid;
  v_member_ids uuid[] := coalesce(p_member_ids, array[]::uuid[]);
  v_current_updated_at timestamptz;
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'permission denied', detail = 'SQA_PERMISSION_DENIED';
  end if;
  if p_expected_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record version is required', detail = 'SQA_MASTER_VERSION_REQUIRED';
  end if;

  select updated_at into v_current_updated_at from public.duties where id = p_duty_id for update;
  if v_current_updated_at is null then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_current_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  delete from public.duty_assignments
   where duty_id = p_duty_id
     and user_id <> all(v_member_ids);

  foreach v_member_id in array v_member_ids loop
    if v_member_id is null then
      raise exception using errcode = 'P0001', message = 'duty assignment user is required', detail = 'SQA_ASSIGNMENT_USER_REQUIRED';
    end if;
    insert into public.duty_assignments (duty_id, user_id)
    values (p_duty_id, v_member_id)
    on conflict (user_id, duty_id) do nothing;
  end loop;

  update public.duties
     set updated_at = clock_timestamp()
   where id = p_duty_id
   returning updated_at into v_current_updated_at;

  return v_current_updated_at;
end;
$$;

revoke all on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz) from public, anon, authenticated;
grant execute on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz) to authenticated;

revoke all on function public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz) from public, anon, authenticated;
grant execute on function public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz) to authenticated;

-- ---------------------------------------------------------------------------
-- Expand-release compatibility boundary: do not drop the existing active-
-- leader write policies or revoke direct UPDATE yet. The production rollout
-- applies database migrations before the new Worker, so the deployed client
-- must remain functional at every migration prefix. New code uses the OCC
-- RPCs above; legacy writes are retired only in a later contract release.
-- ---------------------------------------------------------------------------

grant insert, update, delete on table
  public.allowed_users,
  public.products,
  public.duty_major_categories,
  public.duties
to authenticated;
grant update on table public.profiles to authenticated;

comment on function public.update_product_if_current(uuid, timestamptz, text, text, text, text, integer, text, uuid) is
  'OCC product update with required authoritative-audit reason. Distinguishes not-found, stale, and no-op.';
comment on function public.update_duty_if_current(uuid, timestamptz, text, uuid, integer, text, text, text, uuid) is
  'OCC duty update with required authoritative-audit reason.';
comment on function public.update_duty_major_category_if_current(uuid, timestamptz, text, integer, text, uuid) is
  'OCC duty major category update with required authoritative-audit reason.';
comment on function public.update_allowed_user_if_current(uuid, timestamptz, text, text, public.app_role, text, uuid) is
  'OCC invite update with required authoritative-audit reason. Last-active-leader guard unchanged.';
comment on function public.set_profile_active_if_current(uuid, timestamptz, boolean, text, uuid) is
  'OCC profile active toggle with required authoritative-audit reason. Last-active-leader guard unchanged.';
comment on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz) is
  'OCC product assignment replacement; bumps products.updated_at so a stale concurrent save is rejected.';
comment on function public.replace_duty_assignments_if_current(uuid, uuid[], timestamptz) is
  'OCC duty assignment replacement; bumps duties.updated_at so a stale concurrent save is rejected.';
