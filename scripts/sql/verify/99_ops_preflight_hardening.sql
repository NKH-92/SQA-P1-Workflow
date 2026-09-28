-- Ops preflight hardening readiness. A list row of an active account cannot be
-- deleted, a linked row cannot change email and activation needs the list row
-- (delete and activation lock the list row before the profile); activity_logs keeps the same
-- visibility with initPlan-cached helpers and a newest-first index; the change
-- bootstrap cuts pending tasks last; both last-leader guards share one lock key.
do $verify$
declare
  delete_rpc regprocedure := to_regprocedure('public.delete_allowed_user_if_current(uuid,timestamptz,text,uuid)');
  update_rpc regprocedure := to_regprocedure('public.update_allowed_user_if_current(uuid,timestamptz,text,text,public.app_role,text,uuid)');
  active_rpc regprocedure := to_regprocedure('public.set_profile_active_if_current(uuid,timestamptz,boolean,text,uuid)');
  target regprocedure;
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260928090000') then
    raise exception 'SQA_DB_READY_OPS_PREFLIGHT_MIGRATION';
  end if;

  foreach target in array array[delete_rpc, update_rpc, active_rpc] loop
    if target is null
       or not coalesce((select prosecdef from pg_proc where oid = target), false)
       or not coalesce((select exists (
         select 1 from unnest(proconfig) cfg
          where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')
       ) from pg_proc where oid = target), false)
       or not has_function_privilege('authenticated', target, 'EXECUTE')
       or has_function_privilege('anon', target, 'EXECUTE')
       or position('public.is_active_leader()' in pg_get_functiondef(target)) = 0 then
      raise exception 'SQA_DB_READY_OPS_PREFLIGHT_ACCOUNT_RPC:%', coalesce(target::text, 'missing');
    end if;
  end loop;

  if position('SQA_ACCOUNT_ACTIVE' in pg_get_functiondef(delete_rpc)) = 0
     or position('profile.is_active' in pg_get_functiondef(delete_rpc)) = 0
     or position('private.delete_versioned_row' in pg_get_functiondef(delete_rpc)) = 0
     or position('SQA_ACCOUNT_EMAIL_LOCKED' in pg_get_functiondef(update_rpc)) = 0
     or position('SQA_MASTER_STALE' in pg_get_functiondef(update_rpc)) = 0
     or position('for update' in pg_get_functiondef(delete_rpc)) = 0
     or position('SQA_ACCOUNT_LIST_ROW_REQUIRED' in pg_get_functiondef(active_rpc)) = 0
     or position('from public.allowed_users invite' in pg_get_functiondef(active_rpc)) = 0
     or position('v_list_row_found := found' in pg_get_functiondef(active_rpc)) = 0
     or position('SQA_MASTER_STALE' in pg_get_functiondef(active_rpc)) = 0 then
    raise exception 'SQA_DB_READY_OPS_PREFLIGHT_ACCOUNT_GUARD';
  end if;
end
$verify$;

do $verify$
declare
  policy_qual text;
begin
  select qual into policy_qual
    from pg_policies
   where schemaname = 'public'
     and tablename = 'activity_logs'
     and policyname = 'activity_logs_select_relevant'
     and cmd = 'SELECT'
     and roles = array['authenticated']::name[];

  if policy_qual is null
     or (select count(*) from pg_policies where schemaname = 'public' and tablename = 'activity_logs' and cmd in ('SELECT', 'ALL')) <> 1
     or policy_qual !~* 'select\s+(public\.)?is_active_leader\(\)'
     or policy_qual !~* 'select\s+(public\.)?can_use_app\(\)'
     or policy_qual !~* 'actor_id\s*=\s*\(\s*select\s+auth\.uid\(\)'
     or policy_qual !~* 'target_user_id\s*=\s*\(\s*select\s+auth\.uid\(\)' then
    raise exception 'SQA_DB_READY_OPS_PREFLIGHT_ACTIVITY_POLICY';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'activity_logs'
       and indexname = 'activity_logs_created_at_idx'
       and indexdef like '%(created_at DESC)%'
  ) then
    raise exception 'SQA_DB_READY_OPS_PREFLIGHT_ACTIVITY_INDEX';
  end if;
end
$verify$;

do $verify$
declare
  bootstrap_definition text := pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()'));
  guard_definition text := pg_get_functiondef(to_regprocedure('private.guard_last_leader_role_transition()'));
begin
  if bootstrap_definition is null
     or position('order by (task.status = ''pending'') desc, task.updated_at desc, task.id desc' in bootstrap_definition) = 0
     or position('order by (status = ''pending'') desc, updated_at desc, id desc' in bootstrap_definition) = 0
     or position('''schema_version'', 1' in bootstrap_definition) = 0
     or position('SQA_PRODUCT_CHANGE_TASKS_TRUNCATED' in bootstrap_definition) = 0 then
    raise exception 'SQA_DB_READY_OPS_PREFLIGHT_CHANGE_PENDING_FIRST';
  end if;

  if guard_definition is null
     or position('hashtextextended(''sqa-p1-active-leader-guard'', 0)' in guard_definition) = 0
     or position('sqa:last-active-leader' in guard_definition) > 0
     or position('SQA_LAST_LEADER_PROTECTED' in guard_definition) = 0
     or not exists (
       select 1 from pg_trigger
        where tgrelid = 'public.profiles'::regclass
          and tgname = 'guard_last_leader_role_transition'
          and tgfoid = to_regprocedure('private.guard_last_leader_role_transition()')
          and tgenabled in ('O', 'A')
     ) then
    raise exception 'SQA_DB_READY_OPS_PREFLIGHT_LEADER_LOCK';
  end if;
end
$verify$;
