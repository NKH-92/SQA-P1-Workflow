-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '202607170001')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260717123840')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260722120452')
              and to_regclass('public.change_applications') is not null
              and to_regclass('public.change_action_items') is not null
              and to_regclass('public.product_change_tasks') is not null
              and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.change_applications')), false)
              and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.change_action_items')), false)
              and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.product_change_tasks')), false)
              and exists (select 1 from pg_constraint where conrelid = to_regclass('public.change_applications') and conname = 'change_applications_source_url_scheme_check' and convalidated)
              and exists (select 1 from pg_constraint where conrelid = to_regclass('public.change_applications') and conname = 'change_applications_archive_state_check' and convalidated)
              and exists (select 1 from pg_constraint where conrelid = to_regclass('public.change_applications') and conname = 'change_applications_archive_reason_length_check' and convalidated)
              and (select count(*) = 3 from information_schema.columns where table_schema = 'public' and table_name = 'change_applications' and column_name in ('archived_at', 'archived_by', 'archive_reason'))
              and exists (select 1 from pg_class where oid = to_regclass('public.change_applications_archived_at_idx') and relkind = 'i')
              and coalesce(has_table_privilege('authenticated', to_regclass('public.change_applications'), 'SELECT'), false)
              and coalesce(has_table_privilege('authenticated', to_regclass('public.change_action_items'), 'SELECT'), false)
              and coalesce(has_table_privilege('authenticated', to_regclass('public.product_change_tasks'), 'SELECT'), false)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.change_applications'), 'INSERT'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.change_applications'), 'UPDATE'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.change_applications'), 'DELETE'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.change_action_items'), 'INSERT'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.change_action_items'), 'UPDATE'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.change_action_items'), 'DELETE'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.product_change_tasks'), 'INSERT'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.product_change_tasks'), 'UPDATE'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.product_change_tasks'), 'DELETE'), true)
              and not coalesce(has_table_privilege('anon', to_regclass('public.change_applications'), 'SELECT'), true)
              and not coalesce(has_table_privilege('anon', to_regclass('public.change_action_items'), 'SELECT'), true)
              and not coalesce(has_table_privilege('anon', to_regclass('public.product_change_tasks'), 'SELECT'), true)
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_applications' and policyname = 'change_applications_select_app_user' and qual like '%published_at%' and qual like '%cancelled%' and qual like '%created_by%' and qual like '%is_active_leader()%' and qual not like '%draft%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'change_action_items' and policyname = 'change_action_items_select_app_user' and qual like '%published_at%' and qual like '%cancelled%' and qual like '%created_by%' and qual like '%is_active_leader()%' and qual not like '%draft%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'product_change_tasks' and policyname = 'product_change_tasks_select_relevant' and qual like '%published_at%' and qual like '%cancelled%' and qual like '%assignee_id%')
              and not exists (
                select 1
                  from unnest(array[
                    to_regprocedure('public.list_change_application_product_scope()'),
                    to_regprocedure('public.list_change_application_assignees()'),
                    to_regprocedure('public.save_change_application_draft(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb)'),
                    to_regprocedure('public.publish_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb)'),
                    to_regprocedure('public.complete_product_change_task(uuid,text,text)'),
                    to_regprocedure('public.mark_product_change_task_not_applicable(uuid,text,text)'),
                    to_regprocedure('public.reopen_product_change_task(uuid,text)'),
                    to_regprocedure('public.reassign_product_change_tasks(uuid[],uuid,text)'),
                    to_regprocedure('public.cancel_product_change_task(uuid,text)'),
                    to_regprocedure('public.cancel_change_application(uuid,text)'),
                    to_regprocedure('public.archive_change_application(uuid,text)'),
                    to_regprocedure('public.restore_change_application(uuid,text)'),
                    to_regprocedure('public.assign_product_and_transfer_change_tasks(uuid,uuid,boolean,text)')
                  ]) required_rpc(function_oid)
                 where function_oid is null
                    or not coalesce((select prosecdef from pg_proc where oid = function_oid), false)
                    or not coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = function_oid), false)
                    or not coalesce(has_function_privilege('authenticated', function_oid, 'EXECUTE'), false)
                    or coalesce(has_function_privilege('anon', function_oid, 'EXECUTE'), true)
              )
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('public.save_change_application_draft(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb)')) like '%p_change_application_id, p_expected_updated_at, p_change_number%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.publish_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb)')) like '%p_change_application_id, p_expected_updated_at, p_change_number%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%source url must use http or https%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%cancelled product change task cannot be reactivated%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%existing_action.change_application_id = v_application.id%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%existing_task.status = ''cancelled''%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%p_expected_updated_at is null%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%v_application.updated_at is distinct from p_expected_updated_at%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.persist_change_application(uuid,timestamp with time zone,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)')) like '%change application was modified by another user%', false)
              and to_regprocedure('private.sync_change_application_archive()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('private.sync_change_application_archive()')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('private.sync_change_application_archive()')), false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.sync_change_application_archive()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.sync_change_application_archive()'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sync_change_application_archive()')) like '%new.status in (''completed'', ''not_applicable'')%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sync_change_application_archive()')) like '%new.status = ''pending''%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sync_change_application_archive()')) like '%모든 제품 적용이 완료되어 자동 보관됨%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.sync_change_application_archive()')) like '%completion_kind%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.enforce_archive_origin()')) like '%모든 제품 적용이 완료되어 자동 보관됨%', false)
              and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.change_applications') and tgname = 'change_applications_private_audit' and tgfoid = to_regprocedure('private.record_mutation_audit()') and tgenabled in ('O', 'A'))
              and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.change_action_items') and tgname = 'change_action_items_private_audit' and tgfoid = to_regprocedure('private.record_mutation_audit()') and tgenabled in ('O', 'A'))
              and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.product_change_tasks') and tgname = 'product_change_tasks_private_audit' and tgfoid = to_regprocedure('private.record_mutation_audit()') and tgenabled in ('O', 'A'))
              and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.product_change_tasks') and tgname = 'product_change_tasks_sync_application_archive' and tgfoid = to_regprocedure('private.sync_change_application_archive()') and tgenabled in ('O', 'A'))) = true) then
    raise exception 'SQA_DB_READY_CHANGE_APPLICATIONS_GATE';
  end if;
end
$verify$;
