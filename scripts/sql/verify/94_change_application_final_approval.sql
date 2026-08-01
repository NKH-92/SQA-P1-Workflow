-- Change-application final approval readiness. Keep this gate fail-closed:
-- final approval is the only supported archive path for newly completed work,
-- and every exposed mutation remains authenticated RPC-only.
do $verify$
begin
  if not exists (
    select 1
      from supabase_migrations.schema_migrations
     where version = '20260731230646'
  ) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_MIGRATION';
  end if;

  if to_regclass('public.change_applications') is null
     or to_regclass('public.product_change_tasks') is null
     or (select count(*)
           from information_schema.columns
          where table_schema = 'public'
            and table_name = 'change_applications'
            and (
              (column_name = 'final_completed_at' and data_type = 'timestamp with time zone')
              or (column_name = 'final_completed_by' and data_type = 'uuid')
              or (column_name = 'final_completed_by_name' and data_type = 'text')
              or (column_name = 'final_completion_note' and data_type = 'text')
            )) <> 4
     or not exists (
       select 1 from pg_constraint
        where conrelid = to_regclass('public.change_applications')
          and conname = 'change_applications_final_completion_state_check'
          and contype = 'c'
          and convalidated
     )
     or not exists (
       select 1 from pg_constraint
        where conrelid = to_regclass('public.change_applications')
          and conname = 'change_applications_final_completed_by_name_length_check'
          and contype = 'c'
          and convalidated
     )
     or not exists (
       select 1 from pg_constraint
        where conrelid = to_regclass('public.change_applications')
          and conname = 'change_applications_final_completion_note_length_check'
          and contype = 'c'
          and convalidated
     )
     or not exists (
       select 1 from pg_constraint
        where conrelid = to_regclass('public.change_applications')
          and conname = 'change_applications_final_completed_by_fkey'
          and contype = 'f'
          and convalidated
     ) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_SCHEMA';
  end if;

  if not exists (
       select 1 from pg_indexes
        where schemaname = 'public'
          and tablename = 'change_applications'
          and indexname = 'change_applications_final_completed_idx'
          and indexdef like '%final_completed_at DESC%'
          and indexdef like '%WHERE (final_completed_at IS NOT NULL)%'
     )
     or not exists (
       select 1 from pg_indexes
        where schemaname = 'public'
          and tablename = 'change_applications'
          and indexname = 'change_applications_history_keyset_idx'
          and indexdef like '%final_completed_at%'
          and indexdef like '%archived_at%'
     )
     or not exists (
       select 1 from pg_indexes
        where schemaname = 'public'
          and tablename = 'product_change_tasks'
          and indexname = 'product_change_tasks_history_product_idx'
     )
     or not exists (
       select 1 from pg_indexes
        where schemaname = 'public'
          and tablename = 'product_change_tasks'
          and indexname = 'product_change_tasks_history_assignee_idx'
     )
     or not exists (
       select 1 from pg_indexes
        where schemaname = 'public'
          and tablename = 'product_change_tasks'
          and indexname = 'product_change_tasks_history_completed_by_idx'
     ) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_INDEXES';
  end if;
end
$verify$;

do $verify$
declare
  ledger_table regclass := to_regclass(
    'private.product_change_task_assignee_history'
  );
  capture_function regprocedure := to_regprocedure(
    'private.capture_product_change_task_assignee_history()'
  );
  capture_definition text;
  trigger_definition text;
  privilege_name text;
begin
  if ledger_table is null
     or (select count(*)
           from information_schema.columns
          where table_schema = 'private'
            and table_name = 'product_change_task_assignee_history'
            and (
              (column_name = 'task_id' and data_type = 'uuid')
              or (column_name = 'assignee_id' and data_type = 'uuid')
              or (column_name = 'first_recorded_at' and data_type = 'timestamp with time zone')
            )) <> 3
     or not exists (
       select 1 from pg_constraint
        where conrelid = ledger_table
          and contype = 'p'
     )
     or not exists (
       select 1 from pg_constraint
        where conrelid = ledger_table
          and confrelid = to_regclass('public.product_change_tasks')
          and contype = 'f'
          and confdeltype = 'c'
     )
     or not exists (
       select 1 from pg_indexes
        where schemaname = 'private'
          and tablename = 'product_change_task_assignee_history'
          and indexname = 'product_change_task_assignee_history_assignee_idx'
     ) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_ASSIGNEE_LEDGER';
  end if;

  foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if coalesce(has_table_privilege('authenticated', ledger_table, privilege_name), true)
       or coalesce(has_table_privilege('anon', ledger_table, privilege_name), true) then
      raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_ASSIGNEE_LEDGER_ACL: %',
        privilege_name;
    end if;
  end loop;

  if exists (
       select 1
         from pg_class relation
         cross join lateral aclexplode(
           coalesce(relation.relacl, acldefault('r', relation.relowner))
         ) privilege
        where relation.oid = ledger_table
          and privilege.grantee = 0
     )
     or capture_function is null
     or not coalesce((select prosecdef from pg_proc where oid = capture_function), false)
     or not coalesce((select exists (
       select 1
         from unnest(proconfig) config
        where config in ('search_path=' || chr(34) || chr(34), 'search_path=')
     ) from pg_proc where oid = capture_function), false)
     or coalesce(has_function_privilege('authenticated', capture_function, 'EXECUTE'), true)
     or coalesce(has_function_privilege('anon', capture_function, 'EXECUTE'), true)
     or exists (
       select 1
         from pg_proc function
         cross join lateral aclexplode(
           coalesce(function.proacl, acldefault('f', function.proowner))
         ) privilege
        where function.oid = capture_function
          and privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
     )
     or not exists (
       select 1
         from pg_trigger trigger
        where trigger.tgrelid = to_regclass('public.product_change_tasks')
          and trigger.tgname = 'product_change_tasks_capture_assignee_history'
          and trigger.tgfoid = capture_function
          and not trigger.tgisinternal
          and trigger.tgenabled in ('O', 'A')
     ) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_ASSIGNEE_LEDGER_TRIGGER';
  end if;

  capture_definition := lower(pg_get_functiondef(capture_function));
  select lower(pg_get_triggerdef(trigger.oid))
    into trigger_definition
    from pg_trigger trigger
   where trigger.tgrelid = to_regclass('public.product_change_tasks')
     and trigger.tgname = 'product_change_tasks_capture_assignee_history'
     and not trigger.tgisinternal;
  if position('private.product_change_task_assignee_history' in capture_definition) = 0
     or position('old.assignee_id' in capture_definition) = 0
     or position('new.assignee_id' in capture_definition) = 0
     or position('new.completed_by' in capture_definition) = 0
     or position('on conflict (task_id, assignee_id) do nothing' in capture_definition) = 0
     or position(
       'after insert or update of assignee_id, completed_by'
       in trigger_definition
     ) = 0
     or position(
       'execute function private.capture_product_change_task_assignee_history()'
       in trigger_definition
     ) = 0 then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_ASSIGNEE_LEDGER_CAPTURE';
  end if;

  if exists (
       select 1
         from public.product_change_tasks task
        where task.assignee_id is not null
          and not exists (
            select 1
              from private.product_change_task_assignee_history history
             where history.task_id = task.id
               and history.assignee_id = task.assignee_id
          )
     )
     or exists (
       select 1
         from public.product_change_tasks task
        where task.completed_by is not null
          and not exists (
            select 1
              from private.product_change_task_assignee_history history
             where history.task_id = task.id
               and history.assignee_id = task.completed_by
          )
     ) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_ASSIGNEE_LEDGER_DATA';
  end if;
end
$verify$;

do $verify$
declare
  lock_function regprocedure := to_regprocedure(
    'private.lock_change_application_and_tasks(uuid)'
  );
  task_parent_function regprocedure := to_regprocedure(
    'private.require_change_application_id_for_task(uuid)'
  );
  readiness_function regprocedure := to_regprocedure(
    'private.record_change_application_final_review_readiness(uuid,uuid)'
  );
  function_oid regprocedure;
  private_functions regprocedure[];
  lock_definition text;
  task_parent_definition text;
  readiness_definition text;
begin
  private_functions := array[lock_function, task_parent_function, readiness_function];
  foreach function_oid in array private_functions loop
    if function_oid is null
       or not coalesce((select exists (
         select 1
           from unnest(proconfig) config
          where config in ('search_path=' || chr(34) || chr(34), 'search_path=')
       ) from pg_proc where oid = function_oid), false)
       or coalesce(has_function_privilege('authenticated', function_oid, 'EXECUTE'), true)
       or coalesce(has_function_privilege('anon', function_oid, 'EXECUTE'), true)
       or exists (
         select 1
           from pg_proc function
           cross join lateral aclexplode(
             coalesce(function.proacl, acldefault('f', function.proowner))
           ) privilege
          where function.oid = function_oid
            and privilege.grantee = 0
            and privilege.privilege_type = 'EXECUTE'
       ) then
      raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_PRIVATE_FUNCTIONS: %',
        function_oid;
    end if;
  end loop;

  if not coalesce((select prosecdef from pg_proc where oid = readiness_function), false) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_READINESS_DEFINER';
  end if;

  lock_definition := lower(pg_get_functiondef(lock_function));
  task_parent_definition := lower(pg_get_functiondef(task_parent_function));
  readiness_definition := lower(pg_get_functiondef(readiness_function));
  if position('from public.change_applications application' in lock_definition) = 0
     or position('where application.id = p_change_application_id' in lock_definition) = 0
     or position('for update' in lock_definition) = 0
     or position('from public.product_change_tasks task' in lock_definition)
       <= position('from public.change_applications application' in lock_definition)
     or position(
       'where action_item.change_application_id = v_application.id'
       in lock_definition
     ) = 0
     or position('order by task.id' in lower(lock_definition)) = 0
     or position('for update of task' in lock_definition) = 0
     or position('action_item.change_application_id' in task_parent_definition) = 0
     or position('sqa_change_task_not_found' in task_parent_definition) = 0
     or position('for update' in task_parent_definition) > 0
     or position('final_review_ready' in readiness_definition) = 0
     or position('application_cancelled' in readiness_definition) = 0
     or position('scope_removed' in readiness_definition) = 0
     or position('or assignee.id is null' in readiness_definition) = 0
     or position('v_completed + v_not_applicable + v_scope_removed = v_total' in readiness_definition) = 0 then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_READINESS_CONTRACT';
  end if;

  if exists (
       select 1
         from pg_trigger
        where tgrelid = to_regclass('public.product_change_tasks')
          and tgname in (
            'product_change_tasks_sync_application_archive',
            'product_change_tasks_sync_final_review_readiness'
          )
          and not tgisinternal
          and tgenabled in ('O', 'A')
     ) then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_LEGACY_TRIGGER';
  end if;
end
$verify$;

do $verify$
declare
  function_oid regprocedure;
  required_functions regprocedure[] := array[
    to_regprocedure('public.save_change_application_draft(uuid,timestamptz,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb)'),
    to_regprocedure('public.publish_change_application(uuid,timestamptz,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb)'),
    to_regprocedure('public.complete_product_change_task(uuid,text,text)'),
    to_regprocedure('public.mark_product_change_task_not_applicable(uuid,text,text)'),
    to_regprocedure('public.reopen_product_change_task(uuid,text)'),
    to_regprocedure('public.remove_product_from_change_scope(uuid,text)'),
    to_regprocedure('public.restore_product_change_scope(uuid,text)'),
    to_regprocedure('public.cancel_product_change_task(uuid,text)'),
    to_regprocedure('public.cancel_change_application(uuid,text)'),
    to_regprocedure('public.archive_change_application(uuid,text)'),
    to_regprocedure('public.restore_change_application(uuid,text)'),
    to_regprocedure('public.complete_change_application(uuid,timestamptz,text)'),
    to_regprocedure('public.undo_change_application_completion(uuid,timestamptz,text,jsonb)'),
    to_regprocedure('public.get_change_bootstrap_v3()'),
    to_regprocedure('public.list_change_application_history_v1(text,text,date,date,uuid,uuid,timestamptz,uuid,integer)'),
    to_regprocedure('public.reassign_product_change_tasks(uuid[],uuid,text)'),
    to_regprocedure('public.assign_product_and_transfer_change_tasks(uuid,uuid,boolean,text)')
  ];
begin
  foreach function_oid in array required_functions loop
    if function_oid is null
       or not coalesce((select prosecdef from pg_proc where oid = function_oid), false)
       or not coalesce((select exists (
         select 1
           from unnest(proconfig) config
          where config in ('search_path=' || chr(34) || chr(34), 'search_path=')
       ) from pg_proc where oid = function_oid), false)
       or not coalesce(has_function_privilege('authenticated', function_oid, 'EXECUTE'), false)
       or coalesce(has_function_privilege('anon', function_oid, 'EXECUTE'), true)
       or exists (
         select 1
           from pg_proc function
           cross join lateral aclexplode(
             coalesce(function.proacl, acldefault('f', function.proowner))
           ) privilege
          where function.oid = function_oid
            and privilege.grantee = 0
            and privilege.privilege_type = 'EXECUTE'
       ) then
      raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_RPC_ACL: %', function_oid;
    end if;
  end loop;
end
$verify$;

do $verify$
declare
  function_oid regprocedure;
  complete_rpc regprocedure := to_regprocedure(
    'public.complete_change_application(uuid,timestamptz,text)'
  );
  undo_rpc regprocedure := to_regprocedure(
    'public.undo_change_application_completion(uuid,timestamptz,text,jsonb)'
  );
  bootstrap_rpc regprocedure := to_regprocedure('public.get_change_bootstrap_v3()');
  history_rpc regprocedure := to_regprocedure(
    'public.list_change_application_history_v1(text,text,date,date,uuid,uuid,timestamptz,uuid,integer)'
  );
  complete_task_rpc regprocedure := to_regprocedure(
    'public.complete_product_change_task(uuid,text,text)'
  );
  not_applicable_rpc regprocedure := to_regprocedure(
    'public.mark_product_change_task_not_applicable(uuid,text,text)'
  );
  remove_scope_rpc regprocedure := to_regprocedure(
    'public.remove_product_from_change_scope(uuid,text)'
  );
  persist_rpc regprocedure := to_regprocedure(
    'private.persist_change_application(uuid,timestamptz,text,public.change_application_source,text,text,text,date,public.change_action_kind,text,text,date,jsonb,boolean)'
  );
  lock_callers regprocedure[] := array[
    to_regprocedure('public.complete_product_change_task(uuid,text,text)'),
    to_regprocedure('public.mark_product_change_task_not_applicable(uuid,text,text)'),
    to_regprocedure('public.reopen_product_change_task(uuid,text)'),
    to_regprocedure('public.reassign_product_change_tasks(uuid[],uuid,text)'),
    to_regprocedure('public.remove_product_from_change_scope(uuid,text)'),
    to_regprocedure('public.restore_product_change_scope(uuid,text)'),
    to_regprocedure('public.cancel_product_change_task(uuid,text)'),
    to_regprocedure('public.cancel_change_application(uuid,text)'),
    to_regprocedure('public.assign_product_and_transfer_change_tasks(uuid,uuid,boolean,text)'),
    to_regprocedure('public.archive_change_application(uuid,text)'),
    to_regprocedure('public.restore_change_application(uuid,text)'),
    to_regprocedure('public.complete_change_application(uuid,timestamptz,text)'),
    to_regprocedure('public.undo_change_application_completion(uuid,timestamptz,text,jsonb)'),
    persist_rpc
  ];
  task_parent_callers regprocedure[] := array[
    to_regprocedure('public.complete_product_change_task(uuid,text,text)'),
    to_regprocedure('public.mark_product_change_task_not_applicable(uuid,text,text)'),
    to_regprocedure('public.reopen_product_change_task(uuid,text)'),
    to_regprocedure('public.remove_product_from_change_scope(uuid,text)'),
    to_regprocedure('public.restore_product_change_scope(uuid,text)'),
    to_regprocedure('public.cancel_product_change_task(uuid,text)')
  ];
  readiness_callers regprocedure[] := array[
    persist_rpc,
    to_regprocedure('public.complete_product_change_task(uuid,text,text)'),
    to_regprocedure('public.mark_product_change_task_not_applicable(uuid,text,text)'),
    to_regprocedure('public.reassign_product_change_tasks(uuid[],uuid,text)'),
    to_regprocedure('public.remove_product_from_change_scope(uuid,text)')
  ];
  bootstrap_definition text;
  history_definition text;
begin
  foreach function_oid in array lock_callers loop
    if function_oid is null
       or position(
         'private.lock_change_application_and_tasks' in pg_get_functiondef(function_oid)
       ) = 0 then
      raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_LOCK_CALLER: %', function_oid;
    end if;
  end loop;

  foreach function_oid in array task_parent_callers loop
    if function_oid is null
       or position(
         'private.require_change_application_id_for_task' in pg_get_functiondef(function_oid)
       ) = 0 then
      raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_TASK_PARENT_CALLER: %',
        function_oid;
    end if;
  end loop;

  foreach function_oid in array readiness_callers loop
    if function_oid is null
       or position(
         'private.record_change_application_final_review_readiness' in pg_get_functiondef(function_oid)
       ) = 0 then
      raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_READINESS_CALLER: %',
        function_oid;
    end if;
  end loop;

  if position('SQA_CHANGE_FINAL_NOTE_REQUIRED' in pg_get_functiondef(complete_rpc)) = 0
     or position('final_completed_at = v_now' in pg_get_functiondef(complete_rpc)) = 0
     or position('order by task.id' in lower(pg_get_functiondef(undo_rpc))) = 0
     or position('SQA_CHANGE_REOPEN_TASKS_INVALID' in pg_get_functiondef(undo_rpc)) = 0 then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_MUTATION_CONTRACT';
  end if;

  bootstrap_definition := lower(pg_get_functiondef(bootstrap_rpc));
  history_definition := lower(pg_get_functiondef(history_rpc));

  if position('public.get_change_bootstrap_v2()' in bootstrap_definition) = 0
     or position('base_application_rows as materialized' in bootstrap_definition) = 0
     or position('from base_application_rows entry' in bootstrap_definition) = 0
     or position('visible_applications as materialized' in bootstrap_definition) = 0
     or position('join public.change_applications application' in bootstrap_definition) = 0
     or position('from visible_applications application' in bootstrap_definition) = 0
     or position('join visible_applications application' in bootstrap_definition) = 0
     or position('from public.change_applications application' in bootstrap_definition) > 0
     or position('application.created_by = v_actor_id' in bootstrap_definition) > 0
     or position('application.published_at is not null' in bootstrap_definition) > 0
     or position('with ordinality as entry(value, ordinality)' in bootstrap_definition) = 0
     or position('order by entry.bootstrap_ordinal' in bootstrap_definition) = 0
     or position('order by application.bootstrap_ordinal' in bootstrap_definition) = 0
     or position('''schema_version'', 3' in bootstrap_definition) = 0
     or position('''application_summaries''' in bootstrap_definition) = 0
     or position('''final_review_ready''' in bootstrap_definition) = 0
     or position('p_before_history_at' in history_definition) = 0
     or position('p_before_id' in history_definition) = 0
     or position('limit v_limit + 1' in history_definition) = 0
     or position('position(lower(v_query)' in history_definition) = 0
     or position('private.product_change_task_assignee_history' in history_definition) = 0
     or position('public.activity_logs' in history_definition) > 0 then
    raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_QUERY_CONTRACT';
  end if;
end
$verify$;

do $verify$
declare
  table_oid regclass;
  privilege_name text;
begin
  foreach table_oid in array array[
    to_regclass('public.change_applications'),
    to_regclass('public.change_action_items'),
    to_regclass('public.product_change_tasks')
  ] loop
    if table_oid is null then
      raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_TABLE_MISSING';
    end if;
    foreach privilege_name in array array['INSERT', 'UPDATE', 'DELETE'] loop
      if has_table_privilege('authenticated', table_oid, privilege_name)
         or has_table_privilege('anon', table_oid, privilege_name) then
        raise exception 'SQA_DB_READY_CHANGE_FINAL_APPROVAL_DIRECT_DML: % %',
          table_oid, privilege_name;
      end if;
    end loop;
  end loop;
end
$verify$;
