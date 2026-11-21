-- Home-screen pixel office readiness. The layout table is reachable only through
-- the layout RPCs: nothing is granted on the table itself, reads need app access and
-- writes need an active leader with a compare-and-swap revision.
do $verify$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260927120000')
     or not exists (select 1 from supabase_migrations.schema_migrations where version = '20261121070917') then
    raise exception 'SQA_DB_READY_OFFICE_SEATS_MIGRATION';
  end if;

  if to_regclass('public.office_seats') is null
     or not coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.office_seats')), false)
     or not exists (
       select 1 from pg_constraint
        where conrelid = to_regclass('public.office_seats')
          and conname = 'office_seats_seat_index_check'
          and convalidated
          and pg_get_expr(conbin, conrelid) = '((seat_index >= 1) AND (seat_index <= 10))'
     )
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_seats') and conname = 'office_seats_gender_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_seats') and conname = 'office_seats_style_seed_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.office_seats') and contype = 'u' and conname = 'office_seats_profile_id_key')
     or not exists (
       select 1 from pg_trigger
        where tgrelid = to_regclass('public.office_seats')
          and tgname = 'reject_team_leader_write'
          and tgfoid = to_regprocedure('private.reject_team_leader_business_write()')
          and tgenabled in ('O', 'A')
     )
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'office_seats') then
    raise exception 'SQA_DB_READY_OFFICE_SEATS_TABLE';
  end if;

  if has_table_privilege('authenticated', 'public.office_seats', 'SELECT')
     or has_table_privilege('authenticated', 'public.office_seats', 'INSERT')
     or has_table_privilege('authenticated', 'public.office_seats', 'UPDATE')
     or has_table_privilege('authenticated', 'public.office_seats', 'DELETE')
     or has_table_privilege('anon', 'public.office_seats', 'SELECT') then
    raise exception 'SQA_DB_READY_OFFICE_SEATS_TABLE_ACL';
  end if;

  if to_regprocedure('public.get_office_seats()') is null
     or to_regprocedure('public.replace_office_seats(jsonb,text)') is null
     or to_regprocedure('public.replace_office_seats_v2(jsonb,text)') is null
     or to_regprocedure('private.office_seats_revision()') is null
     or to_regprocedure('private.write_office_seats(jsonb,text,integer)') is null
     or exists (
       select 1 from pg_proc
        where oid in (
          to_regprocedure('public.get_office_seats()'),
          to_regprocedure('public.replace_office_seats(jsonb,text)'),
          to_regprocedure('public.replace_office_seats_v2(jsonb,text)')
        )
          and (
            not prosecdef
            or not coalesce((select bool_or(cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from unnest(proconfig) cfg), false)
            or not has_function_privilege('authenticated', oid, 'EXECUTE')
            or has_function_privilege('anon', oid, 'EXECUTE')
          )
     )
     or has_function_privilege('authenticated', 'private.office_seats_revision()', 'EXECUTE')
     or has_function_privilege('authenticated', 'private.write_office_seats(jsonb,text,integer)', 'EXECUTE')
     or has_function_privilege('anon', 'private.write_office_seats(jsonb,text,integer)', 'EXECUTE')
     or has_function_privilege('service_role', 'private.write_office_seats(jsonb,text,integer)', 'EXECUTE')
     or position('public.can_use_app()' in pg_get_functiondef(to_regprocedure('public.get_office_seats()'))) = 0
     or position('profile.is_active' in pg_get_functiondef(to_regprocedure('public.get_office_seats()'))) = 0
     or position('private.write_office_seats(p_seats, p_expected_revision, 8)' in pg_get_functiondef(to_regprocedure('public.replace_office_seats(jsonb,text)'))) = 0
     or position('private.write_office_seats(p_seats, p_expected_revision, 10)' in pg_get_functiondef(to_regprocedure('public.replace_office_seats_v2(jsonb,text)'))) = 0
     or position('public.can_manage_team_data()' in pg_get_functiondef(to_regprocedure('private.write_office_seats(jsonb,text,integer)'))) = 0
     or position('seat_index > 8' in pg_get_functiondef(to_regprocedure('private.write_office_seats(jsonb,text,integer)'))) = 0
     or position('p_expected_revision is distinct from private.office_seats_revision()' in pg_get_functiondef(to_regprocedure('private.write_office_seats(jsonb,text,integer)'))) = 0
     or position('pg_advisory_xact_lock' in pg_get_functiondef(to_regprocedure('private.write_office_seats(jsonb,text,integer)'))) = 0 then
    raise exception 'SQA_DB_READY_OFFICE_SEATS_RPC';
  end if;
end;
$verify$;
