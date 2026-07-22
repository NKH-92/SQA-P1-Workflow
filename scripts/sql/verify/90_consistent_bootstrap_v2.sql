-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260720150000')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260720161117')
              and to_regprocedure('public.get_core_bootstrap_v2()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.get_core_bootstrap_v2()')), false)
              and coalesce((select pg_get_function_result(to_regprocedure('public.get_core_bootstrap_v2()')) = 'jsonb'), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.get_core_bootstrap_v2()')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.get_core_bootstrap_v2()'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.get_core_bootstrap_v2()'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_core_bootstrap_v2()')) not like '%set transaction isolation level%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_core_bootstrap_v2()')) like '%return (%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_core_bootstrap_v2()')) like '%''{schema_version}'', ''2''::jsonb%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_core_bootstrap_v2()')) like '%leader_profiles%', false)
              and to_regprocedure('private.get_core_bootstrap_v1_legacy()') is not null
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.get_core_bootstrap_v1_legacy()'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('private.get_core_bootstrap_v1_legacy()')) like '%''snapshot_at''%', false)
              and to_regprocedure('public.get_change_bootstrap_v2()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.get_change_bootstrap_v2()')), false)
              and coalesce((select pg_get_function_result(to_regprocedure('public.get_change_bootstrap_v2()')) = 'jsonb'), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.get_change_bootstrap_v2()')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.get_change_bootstrap_v2()'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.get_change_bootstrap_v2()'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')) not like '%set transaction isolation level%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')) like '%return (%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')) like '%''schema_version'', 1%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')) like '%list_change_application_product_scope%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')) like '%list_change_application_assignees%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')) like '%''warnings'', bootstrap_warnings.rows%', false)
              and to_regprocedure('public.get_review_bootstrap_v2()') is not null
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_review_bootstrap_v2()')) not like '%set transaction isolation level%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_review_bootstrap_v2()')) like '%private.get_review_bootstrap_v2_numeric_ids()%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_review_bootstrap_v2()')) like '%jsonb_set%', false)
              and to_regprocedure('private.get_review_bootstrap_v2_numeric_ids()') is not null
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.get_review_bootstrap_v2_numeric_ids()'), 'EXECUTE'), true)) = true) then
    raise exception 'SQA_DB_READY_CONSISTENT_BOOTSTRAP_V2_GATE';
  end if;
end
$verify$;
