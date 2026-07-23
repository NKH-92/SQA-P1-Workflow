-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260720100000')
              and to_regprocedure('private.sqa_business_date(timestamp with time zone)') is not null
              and to_regprocedure('private.sqa_business_year(timestamp with time zone)') is not null
              and to_regprocedure('private.sqa_business_date()') is not null
              and to_regprocedure('private.sqa_business_year()') is not null
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.sqa_business_date(timestamp with time zone)'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.sqa_business_date(timestamp with time zone)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('service_role', to_regprocedure('private.sqa_business_date(timestamp with time zone)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.sqa_business_year(timestamp with time zone)'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.sqa_business_year(timestamp with time zone)'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.sqa_business_date()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.sqa_business_date()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.sqa_business_year()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.sqa_business_year()'), 'EXECUTE'), true)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('private.sqa_business_date(timestamp with time zone)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('private.sqa_business_year(timestamp with time zone)')), false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sqa_business_date(timestamp with time zone)')) like '%Asia/Seoul%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sqa_business_year(timestamp with time zone)')) like '%Asia/Seoul%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sqa_business_date()')) like '%private.sqa_business_date(statement_timestamp())%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sqa_business_year()')) like '%private.sqa_business_year(statement_timestamp())%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%private.sqa_business_year()::text%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) not like '%to_char(current_date%', false)) = true) then
    raise exception 'SQA_DB_READY_BUSINESS_TIMEZONE_GATE';
  end if;
end
$verify$;
