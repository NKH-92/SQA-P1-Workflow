-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
-- Master OCC + authoritative audit reason RPCs must exist, be
-- SECURITY DEFINER with an empty search_path and be authenticated-only. During
-- the expand release, active-leader direct UPDATE remains available for the
-- deployed client; retirement is a later contract release.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260720200000')
              and to_regprocedure('public.update_product_if_current(uuid,timestamptz,text,text,text,text,integer,text,uuid)') is not null
              and to_regprocedure('public.update_duty_if_current(uuid,timestamptz,text,uuid,integer,text,text,text,uuid)') is not null
              and to_regprocedure('public.update_duty_major_category_if_current(uuid,timestamptz,text,integer,text,uuid)') is not null
              and to_regprocedure('public.update_allowed_user_if_current(uuid,timestamptz,text,text,public.app_role,text,uuid)') is not null
              and to_regprocedure('public.set_profile_active_if_current(uuid,timestamptz,boolean,text,uuid)') is not null
              and to_regprocedure('public.set_profile_role_if_current(uuid,timestamptz,public.app_role,text,uuid)') is not null
              and to_regprocedure('public.replace_product_assignments_if_current(uuid,uuid[],text,timestamptz,text,uuid)') is not null
              and to_regprocedure('public.replace_duty_assignments_if_current(uuid,uuid[],timestamptz,text,uuid)') is not null
              and coalesce((select bool_and(prosecdef) from pg_proc
                              where oid in (
                                to_regprocedure('public.update_product_if_current(uuid,timestamptz,text,text,text,text,integer,text,uuid)'),
                                to_regprocedure('public.update_duty_if_current(uuid,timestamptz,text,uuid,integer,text,text,text,uuid)'),
                                to_regprocedure('public.update_duty_major_category_if_current(uuid,timestamptz,text,integer,text,uuid)'),
                                to_regprocedure('public.update_allowed_user_if_current(uuid,timestamptz,text,text,public.app_role,text,uuid)'),
                                to_regprocedure('public.set_profile_active_if_current(uuid,timestamptz,boolean,text,uuid)'),
                                to_regprocedure('public.set_profile_role_if_current(uuid,timestamptz,public.app_role,text,uuid)'),
                                to_regprocedure('public.replace_product_assignments_if_current(uuid,uuid[],text,timestamptz,text,uuid)'),
                                to_regprocedure('public.replace_duty_assignments_if_current(uuid,uuid[],timestamptz,text,uuid)')
                              )), false)
              and coalesce((select bool_and(exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')))
                              from pg_proc
                             where oid in (
                                to_regprocedure('public.update_product_if_current(uuid,timestamptz,text,text,text,text,integer,text,uuid)'),
                                to_regprocedure('public.update_duty_if_current(uuid,timestamptz,text,uuid,integer,text,text,text,uuid)'),
                                to_regprocedure('public.update_duty_major_category_if_current(uuid,timestamptz,text,integer,text,uuid)'),
                                to_regprocedure('public.update_allowed_user_if_current(uuid,timestamptz,text,text,public.app_role,text,uuid)'),
                                to_regprocedure('public.set_profile_active_if_current(uuid,timestamptz,boolean,text,uuid)'),
                                to_regprocedure('public.set_profile_role_if_current(uuid,timestamptz,public.app_role,text,uuid)'),
                                to_regprocedure('public.replace_product_assignments_if_current(uuid,uuid[],text,timestamptz,text,uuid)'),
                                to_regprocedure('public.replace_duty_assignments_if_current(uuid,uuid[],timestamptz,text,uuid)')
                             )), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.update_product_if_current(uuid,timestamptz,text,text,text,text,integer,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.update_product_if_current(uuid,timestamptz,text,text,text,text,integer,text,uuid)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.update_duty_if_current(uuid,timestamptz,text,uuid,integer,text,text,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.update_duty_if_current(uuid,timestamptz,text,uuid,integer,text,text,text,uuid)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.update_duty_major_category_if_current(uuid,timestamptz,text,integer,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.update_duty_major_category_if_current(uuid,timestamptz,text,integer,text,uuid)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.update_allowed_user_if_current(uuid,timestamptz,text,text,public.app_role,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.update_allowed_user_if_current(uuid,timestamptz,text,text,public.app_role,text,uuid)'), 'EXECUTE'), true)
              and position('public.is_active_leader()' in pg_get_functiondef(to_regprocedure('public.update_allowed_user_if_current(uuid,timestamptz,text,text,public.app_role,text,uuid)'))) > 0
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.set_profile_active_if_current(uuid,timestamptz,boolean,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.set_profile_active_if_current(uuid,timestamptz,boolean,text,uuid)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.set_profile_role_if_current(uuid,timestamptz,public.app_role,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.set_profile_role_if_current(uuid,timestamptz,public.app_role,text,uuid)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.replace_product_assignments_if_current(uuid,uuid[],text,timestamptz,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.replace_product_assignments_if_current(uuid,uuid[],text,timestamptz,text,uuid)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.replace_duty_assignments_if_current(uuid,uuid[],timestamptz,text,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.replace_duty_assignments_if_current(uuid,uuid[],timestamptz,text,uuid)'), 'EXECUTE'), true)
              and coalesce(has_table_privilege('authenticated', 'public.products', 'UPDATE'), false)
              and coalesce(has_table_privilege('authenticated', 'public.duties', 'UPDATE'), false)
              and coalesce(has_table_privilege('authenticated', 'public.duty_major_categories', 'UPDATE'), false)
              and coalesce(has_table_privilege('authenticated', 'public.allowed_users', 'UPDATE'), false)
              and coalesce(has_table_privilege('authenticated', 'public.profiles', 'UPDATE'), false)
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'products' and policyname = 'products_write_leader' and coalesce(qual, '') like '%is_active_leader()%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'duties' and policyname = 'duties_write_leader' and coalesce(qual, '') like '%is_active_leader()%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'duty_major_categories' and policyname = 'duty_major_categories_write_leader' and coalesce(qual, '') like '%is_active_leader()%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'allowed_users' and policyname = 'allowed_users_update_leader_compat' and coalesce(qual, '') like '%is_active_leader()%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'profiles_update_leader' and coalesce(qual, '') like '%is_active_leader()%')
              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'allowed_users' and column_name = 'updated_at')) = true) then
    raise exception 'SQA_DB_READY_MASTER_OCC_GATE';
  end if;
end
$verify$;
