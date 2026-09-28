-- Ops preflight hardening. Behavior-preserving fixes from the 2026-09 read-only
-- audit; every object keeps its name, signature, response shape and grants.
--
-- 1. Account list guards: a list row whose email still belongs to an active
--    profile cannot be deleted (deactivate the account first), and the email of
--    a row linked to a profile cannot be changed (Auth email is not changed by
--    this RPC, so the account would silently drop out of the list).
-- 2. activity_logs SELECT policy evaluates the access helpers once per query
--    (initPlan) instead of once per row, and the newest-first list read gets a
--    created_at index. Visibility is unchanged.
-- 3. The change bootstrap keeps pending product tasks first when the 5,000-task
--    startup cap is reached, so the oldest untouched pending tasks are not the
--    ones cut. The final JSON order and the overflow warning are unchanged.
-- 4. Both last-leader guards serialize on one advisory lock key, so the invite
--    path and the profile path can no longer take two keys in opposite order.

-- 1. Account list guards ----------------------------------------------------

create or replace function public.delete_allowed_user_if_current(
  p_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_correlation_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;

  -- Deleting the row does not stop sign-in (access follows profiles.is_active),
  -- and the account can no longer be deactivated from the list afterwards.
  if exists (
    select 1
      from public.allowed_users invite
      join public.profiles profile
        on lower(profile.email::text) = lower(invite.email::text)
     where invite.id = p_id
       and profile.is_active
  ) then
    raise exception using errcode = 'P0001', message = 'active account must be deactivated before deletion', detail = 'SQA_ACCOUNT_ACTIVE';
  end if;

  return private.delete_versioned_row(
    'public.allowed_users'::regclass,
    p_id,
    p_expected_updated_at,
    p_reason,
    'delete_allowed_user_if_current',
    p_correlation_id
  );
end;
$$;

revoke all on function public.delete_allowed_user_if_current(uuid,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_allowed_user_if_current(uuid,timestamptz,text,uuid) to authenticated;

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
  v_linked_profile public.profiles%rowtype;
  v_linked_profile_found boolean := false;
  v_email public.allowed_users.email%type := lower(btrim(coalesce(p_email, '')));
  v_name text := btrim(coalesce(p_name, ''));
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_changed boolean;
  v_updated_at timestamptz;
begin
  if auth.uid() is null or not public.is_active_leader() then
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

  select * into v_invite
    from public.allowed_users
   where id = p_allowed_user_id
   for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'master record not found', detail = 'SQA_MASTER_NOT_FOUND';
  end if;
  if v_invite.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'master record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;

  -- Resolve and lock the Auth-linked profile through the pre-edit email. This
  -- remains stable even when this operation also changes the invite email.
  select * into v_linked_profile
    from public.profiles profile
   where lower(profile.email::text) = lower(v_invite.email::text)
   order by profile.id
   limit 1
   for update;
  v_linked_profile_found := found;

  -- The Auth and profile email stay on the old address, so a new list email
  -- would unlink the signed-up account from its card. Only unlinked invites
  -- may change email; a case-only edit keeps the link and stays allowed.
  if v_linked_profile_found
     and lower(v_invite.email::text) is distinct from lower(v_email::text) then
    raise exception using errcode = 'P0001', message = 'linked account email cannot be changed', detail = 'SQA_ACCOUNT_EMAIL_LOCKED';
  end if;

  v_changed :=
    v_invite.email is distinct from v_email
    or v_invite.name is distinct from v_name
    or v_invite.role is distinct from p_role
    or (v_linked_profile_found and v_linked_profile.role is distinct from p_role);

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

  -- When the email changed, the historical allowed-user trigger searches the
  -- new email and cannot reach the old linked profile. Reconcile its role in
  -- this same transaction; existing last-active-leader triggers still apply.
  if v_linked_profile_found
     and lower(v_invite.email::text) is distinct from lower(v_email::text)
     and v_linked_profile.role is distinct from p_role then
    update public.profiles
       set role = p_role
     where id = v_linked_profile.id;
  end if;

  return v_updated_at;
end;
$$;

revoke all on function public.update_allowed_user_if_current(uuid, timestamptz, text, text, public.app_role, text, uuid)
  from public, anon, authenticated;
grant execute on function public.update_allowed_user_if_current(uuid, timestamptz, text, text, public.app_role, text, uuid)
  to authenticated;

-- 2. activity_logs read cost ------------------------------------------------

-- Same predicate as 202607050004_harden_active_access_rls.sql; the scalar
-- sub-selects let the planner evaluate each helper once per statement.
drop policy if exists "activity_logs_select_relevant" on public.activity_logs;
create policy "activity_logs_select_relevant"
on public.activity_logs for select
to authenticated
using (
  (select public.is_active_leader())
  or (
    (select public.can_use_app())
    and (actor_id = (select auth.uid()) or target_user_id = (select auth.uid()))
  )
);

create index if not exists activity_logs_created_at_idx
on public.activity_logs(created_at desc);

-- 3. Change bootstrap keeps pending tasks under the cap ----------------------

-- Identical to 20260720230000_full_code_review_hardening.sql except the two
-- task cut orderings, which now keep pending tasks first. Both cuts must use
-- the same order, or the second cut would drop the pending rows again.
create or replace function public.get_change_bootstrap_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return (
    with ctx as materialized (
      select v_actor_id as actor_id, public.is_active_leader() as is_leader, clock_timestamp() as snapshot
    ), visible_application_candidates as materialized (
      select application.*, creator.name as creator_name
        from public.change_applications application
        left join public.profiles creator on creator.id = application.created_by
        cross join ctx
       where ctx.is_leader
          or application.created_by = ctx.actor_id
          or (application.published_at is not null and application.status in ('published', 'cancelled'))
       order by application.created_at desc, application.id desc
       limit 1001
    ), visible_applications as materialized (
      select *
        from visible_application_candidates
       order by created_at desc, id desc
       limit 1000
    ), visible_action_item_candidates as materialized (
      select item.*
        from public.change_action_items item
        join visible_applications application on application.id = item.change_application_id
       order by item.created_at desc, item.id desc
       limit 5001
    ), visible_action_items as materialized (
      select *
        from visible_action_item_candidates
       order by created_at desc, id desc
       limit 5000
    ), visible_task_candidates as materialized (
      select task.*
        from public.product_change_tasks task
        join visible_action_items action_item on action_item.id = task.action_item_id
        join visible_applications application on application.id = action_item.change_application_id
        cross join ctx
       where (
          ctx.is_leader
          or application.created_by = ctx.actor_id
          or (
            application.published_at is not null
            and application.status in ('published', 'cancelled')
            and task.assignee_id = ctx.actor_id
          )
       )
       and (task.status = 'pending' or task.updated_at >= ctx.snapshot - interval '6 months')
       order by (task.status = 'pending') desc, task.updated_at desc, task.id desc
       limit 5001
    ), visible_tasks as materialized (
      select *
        from visible_task_candidates
       order by (status = 'pending') desc, updated_at desc, id desc
       limit 5000
    ), bootstrap_warnings as materialized (
      select coalesce(jsonb_agg(warning order by ordinal), '[]'::jsonb) as rows
        from (values
          (1, case when exists (select 1 from visible_application_candidates offset 1000 limit 1)
            then '[SQA_CHANGE_APPLICATIONS_TRUNCATED] 변경 신청이 1,000건을 초과해 최신 1,000건만 불러왔습니다.' end),
          (2, case when exists (select 1 from visible_action_item_candidates offset 5000 limit 1)
            then '[SQA_CHANGE_ACTION_ITEMS_TRUNCATED] 변경 항목이 5,000건을 초과해 최신 5,000건만 불러왔습니다.' end),
          (3, case when exists (select 1 from visible_task_candidates offset 5000 limit 1)
            then '[SQA_PRODUCT_CHANGE_TASKS_TRUNCATED] 제품 적용업무가 5,000건을 초과해 최신 5,000건만 불러왔습니다.' end)
        ) warning_rows(ordinal, warning)
       where warning is not null
    )
    select jsonb_build_object(
      'schema_version', 1,
      'snapshot_at', ctx.snapshot,
      'data', jsonb_build_object(
        'change_applications', (
          select coalesce(jsonb_agg(
            (to_jsonb(application) - 'creator_name')
              || jsonb_build_object('profiles', jsonb_build_object('name', application.creator_name))
            order by application.created_at desc, application.id desc
          ), '[]'::jsonb)
          from visible_applications application
        ),
        'change_action_items', (
          select coalesce(jsonb_agg(to_jsonb(item) order by item.sort_order, item.id), '[]'::jsonb)
          from visible_action_items item
        ),
        'product_change_tasks', (
          select coalesce(jsonb_agg(
            to_jsonb(task) || jsonb_build_object('products', jsonb_build_object(
              'name', product.name, 'category', product.category,
              'company_name', product.company_name, 'sort_order', product.sort_order
            )) order by task.updated_at desc, task.id desc
          ), '[]'::jsonb)
          from visible_tasks task
          left join public.products product on product.id = task.product_id
        ),
        'change_product_scope', (
          select coalesce(jsonb_agg(to_jsonb(scope)), '[]'::jsonb)
          from public.list_change_application_product_scope() scope
        ),
        'change_assignee_options', (
          select coalesce(jsonb_agg(to_jsonb(assignee)), '[]'::jsonb)
          from public.list_change_application_assignees() assignee
        )
      ),
      'warnings', bootstrap_warnings.rows
    )
    from ctx
    cross join bootstrap_warnings
  );
end;
$$;
revoke all on function public.get_change_bootstrap_v2() from public, anon, authenticated;
grant execute on function public.get_change_bootstrap_v2() to authenticated;

-- 4. One lock key for both last-leader guards --------------------------------

-- Identical to 20260820150511_account_admin_and_team_leader_access.sql except
-- the advisory lock, which now uses the key of the 202607110006 guards
-- (profiles_guard_last_active_leader, allowed_users_guard_last_active_leader).
-- Transaction advisory locks are re-entrant, so each path takes one key.
create or replace function private.guard_last_leader_role_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role = 'leader' and old.is_active and new.role <> 'leader' then
    perform pg_advisory_xact_lock(hashtextextended('sqa-p1-active-leader-guard', 0));
    if not exists (
      select 1 from public.profiles profile
       where profile.role = 'leader' and profile.is_active and profile.id <> old.id
    ) then
      raise exception using errcode = 'P0001', message = 'cannot demote the last active leader', detail = 'SQA_LAST_LEADER_PROTECTED';
    end if;
  end if;
  return new;
end;
$$;

notify pgrst, 'reload schema';
