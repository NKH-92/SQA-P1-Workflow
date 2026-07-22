-- Full-code-review expand release: new OCC/audited paths coexist with the
-- deployed authenticated client, bigint cursors are text, and bounded startup
-- reads explicitly report overflow.
do $verify$
declare
  legacy regprocedure;
  current_delete regprocedure;
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260720230000') then
    raise exception 'SQA_DB_READY_FULL_REVIEW_MIGRATION';
  end if;

  foreach legacy in array array[
    to_regprocedure('public.replace_project_assignments(uuid,uuid[])'),
    to_regprocedure('public.replace_product_assignments(uuid,uuid[])'),
    to_regprocedure('public.replace_product_assignments_with_reason(uuid,uuid[],text)'),
    to_regprocedure('public.replace_duty_assignments(uuid,uuid[])'),
    to_regprocedure('public.add_product_assignment(uuid,uuid)'),
    to_regprocedure('public.add_duty_assignment(uuid,uuid)')
  ] loop
    if legacy is null
       or not has_function_privilege('authenticated', legacy, 'EXECUTE')
       or has_function_privilege('anon', legacy, 'EXECUTE') then
      raise exception 'SQA_DB_READY_LEGACY_ASSIGNMENT_COMPAT';
    end if;
  end loop;

  foreach current_delete in array array[
    to_regprocedure('public.delete_product_if_current(uuid,timestamptz,text,uuid)'),
    to_regprocedure('public.delete_duty_if_current(uuid,timestamptz,text,uuid)'),
    to_regprocedure('public.delete_duty_major_category_if_current(uuid,timestamptz,text,uuid)'),
    to_regprocedure('public.delete_allowed_user_if_current(uuid,timestamptz,text,uuid)'),
    to_regprocedure('public.delete_project_if_current(uuid,timestamptz,text,uuid)')
  ] loop
    if current_delete is null
       or not has_function_privilege('authenticated', current_delete, 'EXECUTE')
       or has_function_privilege('anon', current_delete, 'EXECUTE') then
      raise exception 'SQA_DB_READY_VERSIONED_DELETE_RPC';
    end if;
  end loop;

  if not has_table_privilege('authenticated', 'public.products', 'DELETE')
     or not has_table_privilege('authenticated', 'public.duties', 'DELETE')
     or not has_table_privilege('authenticated', 'public.duty_major_categories', 'DELETE')
     or not has_table_privilege('authenticated', 'public.allowed_users', 'DELETE')
     or not has_table_privilege('authenticated', 'public.projects', 'DELETE')
     or not has_table_privilege('authenticated', 'public.profile_notes', 'INSERT')
     or not has_table_privilege('authenticated', 'public.activity_logs', 'INSERT') then
    raise exception 'SQA_DB_READY_FULL_REVIEW_TABLE_ACL';
  end if;

  if to_regprocedure('public.list_audit_events_v2(integer,text)') is null
     or not has_function_privilege('authenticated', to_regprocedure('public.list_audit_events(integer,bigint)'), 'EXECUTE')
     or has_function_privilege('anon', to_regprocedure('public.list_audit_events(integer,bigint)'), 'EXECUTE')
     or position('id::text' in pg_get_functiondef(to_regprocedure('public.list_audit_events_v2(integer,text)'))) = 0
     or position('limit 1001' in lower(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')))) = 0
     or position('limit 5001' in lower(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')))) = 0
     or position('limit 1000' in lower(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')))) = 0
     or position('limit 5000' in lower(pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()')))) = 0
     or position('SQA_CHANGE_APPLICATIONS_TRUNCATED' in pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()'))) = 0
     or position('SQA_CHANGE_ACTION_ITEMS_TRUNCATED' in pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()'))) = 0
     or position('SQA_PRODUCT_CHANGE_TASKS_TRUNCATED' in pg_get_functiondef(to_regprocedure('public.get_change_bootstrap_v2()'))) = 0 then
    raise exception 'SQA_DB_READY_FULL_REVIEW_BOUNDED_READS';
  end if;
end
$verify$;
