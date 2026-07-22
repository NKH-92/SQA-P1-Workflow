-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((to_regprocedure('public.add_product_assignment(uuid,uuid)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.add_product_assignment(uuid,uuid)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.add_product_assignment(uuid,uuid)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.add_product_assignment(uuid,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.add_product_assignment(uuid,uuid)'), 'EXECUTE'), true)
              and to_regprocedure('public.add_duty_assignment(uuid,uuid)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.add_duty_assignment(uuid,uuid)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.add_duty_assignment(uuid,uuid)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.add_duty_assignment(uuid,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.add_duty_assignment(uuid,uuid)'), 'EXECUTE'), true)
              and to_regprocedure('public.try_add_product_assignment(uuid,uuid)') is not null
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.try_add_product_assignment(uuid,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.try_add_product_assignment(uuid,uuid)'), 'EXECUTE'), true)
              and to_regprocedure('public.try_add_duty_assignment(uuid,uuid)') is not null
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.try_add_duty_assignment(uuid,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.try_add_duty_assignment(uuid,uuid)'), 'EXECUTE'), true)
              and to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)') is not null
              and coalesce((select pg_get_function_result(to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)')) = 'timestamp with time zone'), false)
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)'), 'EXECUTE'), true)) = true) then
    raise exception 'SQA_DB_READY_ASSIGNMENT_RPCS';
  end if;
end
$verify$;
do $verify$
begin
  if not ((to_regprocedure('public.validate_assignment_user_active()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.validate_assignment_user_active()')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.validate_assignment_user_active()')), false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.validate_assignment_user_active()')) like '%require_profile_role(new.user_id, ''member''%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.validate_assignment_user_active()')) like '%profile_is_active(new.user_id)%', false)
              and exists (
                select 1 from pg_trigger
                where tgrelid = 'public.product_assignments'::regclass
                  and tgname = 'product_assignments_validate_active'
                  and tgfoid = to_regprocedure('public.validate_assignment_user_active()')
                  and tgenabled in ('O', 'A')
                  and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE OF user_id%'
              )
              and exists (
                select 1 from pg_trigger
                where tgrelid = 'public.duty_assignments'::regclass
                  and tgname = 'duty_assignments_validate_active'
                  and tgfoid = to_regprocedure('public.validate_assignment_user_active()')
                  and tgenabled in ('O', 'A')
                  and pg_get_triggerdef(oid) like '%BEFORE INSERT OR UPDATE OF user_id%'
              )) = true) then
    raise exception 'SQA_DB_READY_ASSIGNMENT_GUARD';
  end if;
end
$verify$;

do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260714075451')
              and exists (
                select 1 from pg_attribute
                 where attrelid = 'public.products'::regclass
                   and attname = 'unassigned_reason'
                   and not attisdropped
              )
              and exists (
                select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_unassigned_reason_length_check'
                   and convalidated
              )
              and to_regprocedure('public.replace_product_assignments_with_reason(uuid,uuid[],text)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.replace_product_assignments_with_reason(uuid,uuid[],text)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.replace_product_assignments_with_reason(uuid,uuid[],text)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.replace_product_assignments_with_reason(uuid,uuid[],text)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.replace_product_assignments_with_reason(uuid,uuid[],text)'), 'EXECUTE'), true)
              and to_regprocedure('public.clear_product_unassigned_reason()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.clear_product_unassigned_reason()')), false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.clear_product_unassigned_reason()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.clear_product_unassigned_reason()'), 'EXECUTE'), true)
              and exists (
                select 1 from pg_trigger
                 where tgrelid = 'public.product_assignments'::regclass
                   and tgname = 'product_assignments_clear_unassigned_reason'
                   and tgfoid = to_regprocedure('public.clear_product_unassigned_reason()')
                   and tgenabled in ('O', 'A')
              )
              and to_regprocedure('public.validate_project_assignment_member()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.validate_project_assignment_member()')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.validate_project_assignment_member()')), false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.validate_project_assignment_member()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.validate_project_assignment_member()'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.validate_project_assignment_member()')) like '%new.user_id = auth.uid()%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.validate_project_assignment_member()')) like '%profile_has_role(new.user_id, ''member''%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.validate_project_assignment_member()')) like '%is_active_leader()%', false)) = true) then
    raise exception 'SQA_DB_READY_LEADER_UI_GATE';
  end if;
end
$verify$;

do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260720231000')
              and exists (
                select 1 from pg_class
                 where oid = 'public.public_leader_profiles'::regclass
                   and coalesce(reloptions, '{}'::text[]) @> array['security_invoker=true', 'security_barrier=true']
              )
              and to_regprocedure('private.list_active_leader_profiles()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('private.list_active_leader_profiles()')), false)
              and coalesce((select exists (
                select 1 from unnest(proconfig) cfg
                 where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')
              ) from pg_proc where oid = to_regprocedure('private.list_active_leader_profiles()')), false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.list_active_leader_profiles()')) like '%public.can_use_app()%', false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('private.list_active_leader_profiles()'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.list_active_leader_profiles()'), 'EXECUTE'), true)
              and coalesce(has_table_privilege('authenticated', 'public.public_leader_profiles', 'SELECT'), false)
              and not coalesce(has_table_privilege('anon', 'public.public_leader_profiles', 'SELECT'), true)) = true) then
    raise exception 'SQA_DB_READY_LEADER_VIEW_GATE';
  end if;
end
$verify$;

do $verify$
begin
  if not ((to_regprocedure('public.count_active_leaders_except(uuid)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.count_active_leaders_except(uuid)')), false)
              and coalesce((select provolatile = 'v' from pg_proc where oid = to_regprocedure('public.count_active_leaders_except(uuid)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.count_active_leaders_except(uuid)')), false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.count_active_leaders_except(uuid)'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.count_active_leaders_except(uuid)'), 'EXECUTE'), true)
              and pg_get_functiondef(to_regprocedure('public.guard_last_active_leader_profile()')) like '%pg_advisory_xact_lock%'
              and pg_get_functiondef(to_regprocedure('public.guard_last_active_leader_allowed_user()')) like '%pg_advisory_xact_lock%') = true) then
    raise exception 'SQA_DB_READY_LAST_LEADER_GATE';
  end if;
end
$verify$;
