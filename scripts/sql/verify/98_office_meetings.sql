-- Instant office meeting readiness. Active app users may only SELECT the two
-- tables (for Realtime); every write goes through the RPCs, the room holds one
-- meeting (now or later today, with a location), invitees must be seated and
-- not on leave, and team leaders keep the write guard.
do $verify$
declare
  target text;
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260927140000') then
    raise exception 'SQA_DB_READY_OFFICE_MEETINGS_MIGRATION';
  end if;

  foreach target in array array['office_meetings', 'office_meeting_participants'] loop
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
      raise exception 'SQA_DB_READY_OFFICE_MEETINGS_TABLE:%', target;
    end if;

    if not has_table_privilege('authenticated', 'public.' || target, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || target, 'INSERT')
       or has_table_privilege('authenticated', 'public.' || target, 'UPDATE')
       or has_table_privilege('authenticated', 'public.' || target, 'DELETE')
       or has_table_privilege('anon', 'public.' || target, 'SELECT') then
      raise exception 'SQA_DB_READY_OFFICE_MEETINGS_TABLE_ACL:%', target;
    end if;
  end loop;

  if not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_meetings') and conname = 'office_meetings_singleton_key' and contype = 'u')
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_meetings') and conname = 'office_meetings_singleton_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_meetings') and conname = 'office_meetings_title_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_meetings') and conname = 'office_meetings_location_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_meetings') and conname = 'office_meetings_expiry_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_meeting_participants') and conname = 'office_meeting_participants_pkey' and contype = 'p') then
    raise exception 'SQA_DB_READY_OFFICE_MEETINGS_CONSTRAINTS';
  end if;

  if to_regprocedure('public.get_office_meeting()') is null
     or to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)') is null
     or to_regprocedure('public.acknowledge_office_meeting(uuid)') is null
     or to_regprocedure('public.end_office_meeting(uuid)') is null
     or has_function_privilege('anon', 'public.get_office_meeting()', 'EXECUTE')
     or has_function_privilege('anon', 'public.start_office_meeting(text,uuid[],timestamptz,text)', 'EXECUTE')
     or has_function_privilege('anon', 'public.acknowledge_office_meeting(uuid)', 'EXECUTE')
     or has_function_privilege('anon', 'public.end_office_meeting(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.get_office_meeting()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.start_office_meeting(text,uuid[],timestamptz,text)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.acknowledge_office_meeting(uuid)', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.end_office_meeting(uuid)', 'EXECUTE')
     or exists (
       select 1 from pg_proc
        where oid in (
          to_regprocedure('public.get_office_meeting()'),
          to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)'),
          to_regprocedure('public.acknowledge_office_meeting(uuid)'),
          to_regprocedure('public.end_office_meeting(uuid)')
        )
          and (not prosecdef or not coalesce((select bool_or(cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from unnest(proconfig) cfg), false))
     )
     or position('public.can_use_app()' in pg_get_functiondef(to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)'))) = 0
     or position('public.office_seats' in pg_get_functiondef(to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)'))) = 0
     or position('SQA_OFFICE_MEETING_BUSY' in pg_get_functiondef(to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)'))) = 0
     or position('pg_advisory_xact_lock' in pg_get_functiondef(to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)'))) = 0
     or position('public.member_leaves' in pg_get_functiondef(to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)'))) = 0
     or position('SQA_OFFICE_MEETING_TIME_INVALID' in pg_get_functiondef(to_regprocedure('public.start_office_meeting(text,uuid[],timestamptz,text)'))) = 0
     or position('public.can_manage_team_data()' in pg_get_functiondef(to_regprocedure('public.end_office_meeting(uuid)'))) = 0
     or position('participant.user_id = v_actor_id' in pg_get_functiondef(to_regprocedure('public.acknowledge_office_meeting(uuid)'))) = 0 then
    raise exception 'SQA_DB_READY_OFFICE_MEETINGS_RPC';
  end if;

  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and (
       select count(*) from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename in ('office_meetings', 'office_meeting_participants')
     ) <> 2 then
    raise exception 'SQA_DB_READY_OFFICE_MEETINGS_REALTIME';
  end if;
end;
$verify$;
