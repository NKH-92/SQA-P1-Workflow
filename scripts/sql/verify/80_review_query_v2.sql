-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260720120000')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260720161117')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260720210000')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260720220000')
              and to_regprocedure('public.get_review_bootstrap_v2()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.get_review_bootstrap_v2()')), false)
              and coalesce((select pg_get_function_result(to_regprocedure('public.get_review_bootstrap_v2()')) = 'jsonb'), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.get_review_bootstrap_v2()')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.get_review_bootstrap_v2()'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.get_review_bootstrap_v2()'), 'EXECUTE'), true)
              and to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)')), false)
              and coalesce((select pg_get_function_result(to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)')) = 'jsonb'), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)')) like '%order by event.id desc%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)')) not like '%offset%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)')) like '%page.id::text%', false)
              and to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)')), false)
              and coalesce((select pg_get_function_result(to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)')) = 'jsonb'), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)')) like '%is_active_leader()%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)')) like '%monthly_breakdown%', false)
              and to_regprocedure('private.get_review_statistics_v2_single_scope(date,date,uuid,public.review_status)') is not null
              and coalesce(pg_get_functiondef(to_regprocedure('private.get_review_statistics_v2_single_scope(date,date,uuid,public.review_status)')) like '%private.sqa_business_date%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.get_review_statistics_v2_single_scope(date,date,uuid,public.review_status)')) like '%requester_breakdown%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.get_review_statistics_v2_single_scope(date,date,uuid,public.review_status)')) like '%request.created_at%', false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.get_review_statistics_v2_single_scope(date,date,uuid,public.review_status)'), 'EXECUTE'), true)
              and to_regprocedure('private.get_review_statistics_v2_legacy(date,date,uuid,public.review_status)') is not null
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.get_review_statistics_v2_legacy(date,date,uuid,public.review_status)'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('private.get_review_statistics_v2_single_scope(date,date,uuid,public.review_status)')) not like '%review_events%event.metadata%', false)
              and exists (
                select 1 from pg_indexes
                 where schemaname = 'public' and tablename = 'review_events'
                   and indexdef like '%review_request_id%' and indexdef like '%occurred_at%'
              )) = true) then
    raise exception 'SQA_DB_READY_REVIEW_QUERY_V2_GATE';
  end if;
end
$verify$;
