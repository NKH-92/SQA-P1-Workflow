-- Home-screen office alert readiness. Personal "last checked" marks are reachable
-- only through the two RPCs: nothing is granted on the table itself, both RPCs
-- need app access and act on auth.uid(), and team leaders keep the write guard.
do $verify$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20260927130000') then
    raise exception 'SQA_DB_READY_SECTION_READ_MARKS_MIGRATION';
  end if;

  if to_regclass('public.section_read_marks') is null
     or not coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.section_read_marks')), false)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.section_read_marks') and conname = 'section_read_marks_pkey' and contype = 'p')
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.section_read_marks') and conname = 'section_read_marks_section_check' and convalidated)
     or not exists (select 1 from pg_constraint where conrelid = to_regclass('public.section_read_marks') and conname = 'section_read_marks_keys_check' and convalidated)
     or not exists (
       select 1 from pg_trigger
        where tgrelid = to_regclass('public.section_read_marks')
          and tgname = 'reject_team_leader_write'
          and tgfoid = to_regprocedure('private.reject_team_leader_business_write()')
          and tgenabled in ('O', 'A')
     )
     or exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'section_read_marks') then
    raise exception 'SQA_DB_READY_SECTION_READ_MARKS_TABLE';
  end if;

  if has_table_privilege('authenticated', 'public.section_read_marks', 'SELECT')
     or has_table_privilege('authenticated', 'public.section_read_marks', 'INSERT')
     or has_table_privilege('authenticated', 'public.section_read_marks', 'UPDATE')
     or has_table_privilege('authenticated', 'public.section_read_marks', 'DELETE')
     or has_table_privilege('anon', 'public.section_read_marks', 'SELECT') then
    raise exception 'SQA_DB_READY_SECTION_READ_MARKS_TABLE_ACL';
  end if;

  if to_regprocedure('public.get_section_read_marks()') is null
     or to_regprocedure('public.mark_section_seen(text,uuid[])') is null
     or not has_function_privilege('authenticated', 'public.get_section_read_marks()', 'EXECUTE')
     or has_function_privilege('anon', 'public.get_section_read_marks()', 'EXECUTE')
     or not has_function_privilege('authenticated', 'public.mark_section_seen(text,uuid[])', 'EXECUTE')
     or has_function_privilege('anon', 'public.mark_section_seen(text,uuid[])', 'EXECUTE')
     or not coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.get_section_read_marks()')), false)
     or not coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.mark_section_seen(text,uuid[])')), false)
     or not coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.get_section_read_marks()')), false)
     or not coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.mark_section_seen(text,uuid[])')), false)
     or position('public.can_use_app()' in pg_get_functiondef(to_regprocedure('public.get_section_read_marks()'))) = 0
     or position('mark.user_id = auth.uid()' in pg_get_functiondef(to_regprocedure('public.get_section_read_marks()'))) = 0
     or position('public.can_use_app()' in pg_get_functiondef(to_regprocedure('public.mark_section_seen(text,uuid[])'))) = 0
     or position('SQA_SECTION_INVALID' in pg_get_functiondef(to_regprocedure('public.mark_section_seen(text,uuid[])'))) = 0
     or position('SQA_SECTION_KEYS_INVALID' in pg_get_functiondef(to_regprocedure('public.mark_section_seen(text,uuid[])'))) = 0 then
    raise exception 'SQA_DB_READY_SECTION_READ_MARKS_RPC';
  end if;
end;
$verify$;
