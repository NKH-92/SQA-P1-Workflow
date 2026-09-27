-- Member presence readiness. Active app users may only SELECT the two tables
-- (for Realtime); every write goes through the RPCs, which let people change
-- their own presence and the active leader change anyone's, keep leave periods
-- valid and non-overlapping, and team leaders keep the write guard.
do $verify$
declare
  target text;
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260927135000') then
    raise exception 'SQA_DB_READY_MEMBER_PRESENCE_MIGRATION';
  end if;

  foreach target in array array['member_statuses', 'member_leaves'] loop
    if to_regclass('public.' || target) is null
       or not coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.' || target)), false)
       or not exists (
         select 1 from pg_trigger
          where tgrelid = to_regclass('public.' || target)
            and tgname = 'reject_team_leader_write'
            and tgfoid = to_regprocedure('private.reject_team_leader_business_write()')
            and tgenabled in ('O', 'A')
       )
       or exists (
         select 1 from pg_policies
          where schemaname = 'public' and tablename = target and cmd <> 'SELECT'
       )
       or not exists (
         select 1 from pg_policies
          where schemaname = 'public' and tablename = target and cmd = 'SELECT'
            and qual like '%can_use_app()%'
       ) then
      raise exception 'SQA_DB_READY_MEMBER_PRESENCE_TABLE:%', target;
    end if;

    if not has_table_privilege('authenticated', 'public.' || target, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || target, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || target, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || target, 'DELETE')
       or has_table_privilege('anon', 'public.' || target, 'SELECT') then
      raise exception 'SQA_DB_READY_MEMBER_PRESENCE_TABLE_ACL:%', target;
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conrelid = to_regclass('public.member_statuses') and conname = 'member_statuses_status_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.member_leaves') and conname = 'member_leaves_kind_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.member_leaves') and conname = 'member_leaves_range_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.member_leaves') and conname = 'member_leaves_note_check' and convalidated) then
    raise exception 'SQA_DB_READY_MEMBER_PRESENCE_CONSTRAINTS';
  end if;

  if to_regprocedure('public.get_member_presence()') is null
     or to_regprocedure('public.set_member_status(uuid,text)') is null
     or to_regprocedure('public.add_member_leave(uuid,text,date,date,text)') is null
     or to_regprocedure('public.delete_member_leave(uuid)') is null
     or to_regprocedure('private.assert_member_presence_writer(uuid)') is null
     or has_function_privilege('anon', 'public.get_member_presence()', 'EXECUTE')
     or has_function_privilege('anon', 'public.set_member_status(uuid,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.add_member_leave(uuid,text,date,date,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.delete_member_leave(uuid)', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.assert_member_presence_writer(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_member_presence()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.set_member_status(uuid,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.add_member_leave(uuid,text,date,date,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.delete_member_leave(uuid)', 'EXECUTE')
     or exists (
       select 1 from pg_proc
        where oid in (
          to_regprocedure('public.get_member_presence()'),
          to_regprocedure('public.set_member_status(uuid,text)'),
          to_regprocedure('public.add_member_leave(uuid,text,date,date,text)'),
          to_regprocedure('public.delete_member_leave(uuid)'),
          to_regprocedure('private.assert_member_presence_writer(uuid)')
        )
          and (not prosecdef or not coalesce((select bool_or(cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from unnest(proconfig) cfg), false))
     )
     or position('public.can_manage_team_data()' in pg_get_functiondef(to_regprocedure('private.assert_member_presence_writer(uuid)'))) = 0
     or position('SQA_TEAM_LEADER_READ_ONLY' in pg_get_functiondef(to_regprocedure('private.assert_member_presence_writer(uuid)'))) = 0
     or position('private.assert_member_presence_writer' in pg_get_functiondef(to_regprocedure('public.set_member_status(uuid,text)'))) = 0
     or position('private.assert_member_presence_writer' in pg_get_functiondef(to_regprocedure('public.add_member_leave(uuid,text,date,date,text)'))) = 0
     or position('SQA_MEMBER_LEAVE_OVERLAP' in pg_get_functiondef(to_regprocedure('public.add_member_leave(uuid,text,date,date,text)'))) = 0
     or position('pg_advisory_xact_lock' in pg_get_functiondef(to_regprocedure('public.add_member_leave(uuid,text,date,date,text)'))) = 0
     or position('public.can_manage_team_data()' in pg_get_functiondef(to_regprocedure('public.delete_member_leave(uuid)'))) = 0 then
    raise exception 'SQA_DB_READY_MEMBER_PRESENCE_RPC';
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and (
       select count(*) from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename in ('member_statuses', 'member_leaves')
     ) <> 2 then
    raise exception 'SQA_DB_READY_MEMBER_PRESENCE_REALTIME';
  end if;
end;
$verify$;
