-- Review history and retention readiness is static by design. The destructive
-- cascade/idempotency probe runs only in scripts/run-local-rls-gate.mjs.
do $verify$
declare
  history_rpc regprocedure := to_regprocedure(
    'public.list_review_history_v1(text,text,date,date,timestamp with time zone,uuid,integer)'
  );
  reject_rpc regprocedure := to_regprocedure(
    'public.reject_review_request(uuid,timestamp with time zone,text)'
  );
  purge_rpc regprocedure := to_regprocedure(
    'private.purge_expired_review_requests(timestamp with time zone)'
  );
  bootstrap_impl regprocedure := to_regprocedure('private.get_review_bootstrap_v2_numeric_ids()');
begin
  if not exists (
    select 1 from supabase_migrations.schema_migrations where version = '20260731151100'
  ) then
    raise exception 'SQA_DB_READY_REVIEW_RETENTION_MIGRATION';
  end if;

  if history_rpc is null
     or not coalesce((select prosecdef from pg_proc where oid = history_rpc), false)
     or not coalesce((select exists (
       select 1 from unnest(proconfig) cfg
        where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')
     ) from pg_proc where oid = history_rpc), false)
     or not has_function_privilege('authenticated', history_rpc, 'EXECUTE')
     or has_function_privilege('anon', history_rpc, 'EXECUTE')
     or position('public.is_active_leader()' in pg_get_functiondef(history_rpc)) = 0
     or position('private.sqa_business_date' in pg_get_functiondef(history_rpc)) = 0
     or position('interval ''365 days''' in pg_get_functiondef(history_rpc)) = 0
     or position('position(lower(v_query)' in pg_get_functiondef(history_rpc)) = 0
     or position('p_before_terminal_at' in pg_get_functiondef(history_rpc)) = 0
     or position('limit v_limit + 1' in lower(pg_get_functiondef(history_rpc))) = 0 then
    raise exception 'SQA_DB_READY_REVIEW_HISTORY_RPC';
  end if;

  if reject_rpc is null
     or not coalesce((select prosecdef from pg_proc where oid = reject_rpc), false)
     or not coalesce((select exists (
       select 1 from unnest(proconfig) cfg
        where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')
     ) from pg_proc where oid = reject_rpc), false)
     or not has_function_privilege('authenticated', reject_rpc, 'EXECUTE')
     or has_function_privilege('anon', reject_rpc, 'EXECUTE')
     or position('nullif(btrim(coalesce(p_comment, '''')), '''')' in pg_get_functiondef(reject_rpc)) = 0
     or position('comment_provided' in pg_get_functiondef(reject_rpc)) = 0
     or position('댓글 없이 반려' in pg_get_functiondef(reject_rpc)) = 0 then
    raise exception 'SQA_DB_READY_OPTIONAL_REJECTION_COMMENT';
  end if;

  if bootstrap_impl is null
     or not coalesce((select prosecdef from pg_proc where oid = bootstrap_impl), false)
     or has_function_privilege('authenticated', bootstrap_impl, 'EXECUTE')
     or has_function_privilege('anon', bootstrap_impl, 'EXECUTE')
     or position('private.sqa_business_date' in pg_get_functiondef(bootstrap_impl)) = 0
     or position('- 6' in pg_get_functiondef(bootstrap_impl)) = 0
     or position('interval ''6 months''' in pg_get_functiondef(bootstrap_impl)) = 0 then
    raise exception 'SQA_DB_READY_REVIEW_SEVEN_DAY_BOOTSTRAP';
  end if;
end
$verify$;

do $verify$
declare
  purge_rpc regprocedure := to_regprocedure(
    'private.purge_expired_review_requests(timestamp with time zone)'
  );
  purge_definition text;
begin
  if purge_rpc is null
     or not coalesce((select prosecdef from pg_proc where oid = purge_rpc), false)
     or not coalesce((select exists (
       select 1 from unnest(proconfig) cfg
        where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')
     ) from pg_proc where oid = purge_rpc), false)
     or has_function_privilege('anon', purge_rpc, 'EXECUTE')
     or has_function_privilege('authenticated', purge_rpc, 'EXECUTE')
     or has_function_privilege('service_role', purge_rpc, 'EXECUTE')
     or not has_function_privilege('postgres', purge_rpc, 'EXECUTE') then
    raise exception 'SQA_DB_READY_REVIEW_PURGE_ACL';
  end if;

  purge_definition := pg_get_functiondef(purge_rpc);
  if position('pg_advisory_xact_lock' in purge_definition) = 0
     or position('< p_now - interval ''365 days''' in purge_definition) = 0
     or position('delete from public.activity_logs' in purge_definition) = 0
     or position('delete from private.review_status_events' in purge_definition) = 0
     or position('delete from public.review_requests' in purge_definition) = 0
     or position('delete from private.audit_events' in purge_definition) = 0 then
    raise exception 'SQA_DB_READY_REVIEW_PURGE_CONTRACT';
  end if;

  if not exists (
    select 1 from pg_indexes
     where schemaname = 'public'
       and tablename = 'review_requests'
       and indexname = 'review_requests_terminal_history_idx'
       and indexdef like '%closed_at%'
       and indexdef like '%withdrawn_at%'
       and indexdef like '%approved%'
       and indexdef like '%rejected%'
       and indexdef like '%withdrawn%'
  ) then
    raise exception 'SQA_DB_READY_REVIEW_HISTORY_INDEX';
  end if;
end
$verify$;

do $verify$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron')
     or (select count(*) from cron.job where jobname = 'sqa-review-retention-daily') <> 1
     or not exists (
       select 1 from cron.job
        where jobname = 'sqa-review-retention-daily'
          and schedule = '0 21 * * *'
          and btrim(command) = 'select private.purge_expired_review_requests();'
          and active
     ) then
    raise exception 'SQA_DB_READY_REVIEW_RETENTION_CRON';
  end if;
end
$verify$;
