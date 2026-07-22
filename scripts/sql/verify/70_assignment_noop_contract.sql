-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260720110000')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260720180000')
              and to_regprocedure('public.try_add_product_assignment(uuid,uuid)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.try_add_product_assignment(uuid,uuid)')), false)
              and coalesce((select pg_get_function_result(to_regprocedure('public.try_add_product_assignment(uuid,uuid)')) = 'boolean'), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.try_add_product_assignment(uuid,uuid)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.try_add_product_assignment(uuid,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.try_add_product_assignment(uuid,uuid)'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.try_add_product_assignment(uuid,uuid)')) like '%on conflict (user_id, product_id) do nothing%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.try_add_product_assignment(uuid,uuid)')) like '%return v_inserted%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.try_add_product_assignment(uuid,uuid)')) like '%update public.products set updated_at = clock_timestamp()%', false)
              and to_regprocedure('public.try_add_duty_assignment(uuid,uuid)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.try_add_duty_assignment(uuid,uuid)')), false)
              and coalesce((select pg_get_function_result(to_regprocedure('public.try_add_duty_assignment(uuid,uuid)')) = 'boolean'), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.try_add_duty_assignment(uuid,uuid)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.try_add_duty_assignment(uuid,uuid)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.try_add_duty_assignment(uuid,uuid)'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.try_add_duty_assignment(uuid,uuid)')) like '%on conflict (user_id, duty_id) do nothing%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.try_add_duty_assignment(uuid,uuid)')) like '%return v_inserted%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.try_add_duty_assignment(uuid,uuid)')) like '%update public.duties set updated_at = clock_timestamp()%', false)
              and to_regprocedure('public.add_product_assignment(uuid,uuid)') is not null
              and to_regprocedure('public.add_duty_assignment(uuid,uuid)') is not null) = true) then
    raise exception 'SQA_DB_READY_ASSIGNMENT_NOOP_GATE';
  end if;
end
$verify$;
