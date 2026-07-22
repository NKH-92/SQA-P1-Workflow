-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260718153410')
              and to_regclass('private.audit_events') is not null
              and not has_schema_privilege('authenticated', 'private', 'USAGE')
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('private.record_mutation_audit()')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('private.record_mutation_audit()')), false)
              and coalesce((select prosrc like '%v_after := v_new_sanitized%' and prosrc like '%schema_version%' from pg_proc where oid = to_regprocedure('private.record_mutation_audit()')), false)
              and to_regprocedure('private.build_audit_business_snapshot(text,jsonb)') is not null
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.build_audit_business_snapshot(text,jsonb)'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.build_audit_business_snapshot(text,jsonb)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.list_audit_events(integer,bigint)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.list_audit_events(integer,bigint)'), 'EXECUTE'), true)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.list_audit_events_v2(integer,text)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.list_audit_events_v2(integer,text)'), 'EXECUTE'), true)
              and (
                select count(*) = 16 from pg_trigger
                where tgfoid = to_regprocedure('private.record_mutation_audit()')
                  and tgenabled in ('O', 'A')
              )
              and exists (
                select 1 from pg_trigger
                where tgrelid = 'public.profile_notes'::regclass
                  and tgname = 'profile_notes_private_audit'
                  and tgfoid = to_regprocedure('private.record_mutation_audit()')
                  and tgenabled in ('O', 'A')
              )
              and exists (
                select 1 from pg_trigger
                where tgrelid = to_regclass('public.announcements')
                  and tgname = 'announcements_private_audit'
                  and tgfoid = to_regprocedure('private.record_mutation_audit()')
                  and tgenabled in ('O', 'A')
              )) = true) then
    raise exception 'SQA_DB_READY_PRIVATE_AUDIT_GATE';
  end if;
end
$verify$;
