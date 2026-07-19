-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260716200422')
              and to_regclass('public.announcements') is not null
              and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.announcements')), false)
              and exists (select 1 from pg_constraint where conrelid = to_regclass('public.announcements') and conname = 'announcements_title_length_check' and convalidated)
              and exists (select 1 from pg_constraint where conrelid = to_regclass('public.announcements') and conname = 'announcements_body_length_check' and convalidated)
              and exists (select 1 from pg_constraint where conrelid = to_regclass('public.announcements') and conname = 'announcements_pin_state_check' and convalidated)
              and exists (select 1 from pg_class where oid = to_regclass('public.announcements_created_by_idx') and relkind = 'i')
              and exists (select 1 from pg_class where oid = to_regclass('public.announcements_board_order_idx') and relkind = 'i')
              and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.announcements') and tgname = 'announcements_enforce_invariants' and tgfoid = to_regprocedure('private.enforce_announcement_invariants()') and tgenabled in ('O', 'A'))
              and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.announcements') and tgname = 'announcements_set_updated_at' and tgfoid = to_regprocedure('public.set_updated_at()') and tgenabled in ('O', 'A'))
              and exists (select 1 from pg_trigger where tgrelid = to_regclass('public.announcements') and tgname = 'announcements_private_audit' and tgfoid = to_regprocedure('private.record_mutation_audit()') and tgenabled in ('O', 'A'))
              and to_regprocedure('private.enforce_announcement_invariants()') is not null
              and not coalesce((select prosecdef from pg_proc where oid = to_regprocedure('private.enforce_announcement_invariants()')), true)
              and coalesce((select 'search_path=pg_catalog, public, private, pg_temp' = any(proconfig) from pg_proc where oid = to_regprocedure('private.enforce_announcement_invariants()')), false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('private.enforce_announcement_invariants()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('private.enforce_announcement_invariants()'), 'EXECUTE'), true)
              and coalesce(pg_get_functiondef(to_regprocedure('private.enforce_announcement_invariants()')) like '%new.title := btrim(new.title)%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.enforce_announcement_invariants()')) like '%new.created_by is distinct from old.created_by%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.enforce_announcement_invariants()')) like '%new.created_at is distinct from old.created_at%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('private.enforce_announcement_invariants()')) like '%new.pinned_at := now()%', false)
              and coalesce(has_table_privilege('authenticated', to_regclass('public.announcements'), 'SELECT'), false)
              and coalesce(has_table_privilege('authenticated', to_regclass('public.announcements'), 'DELETE'), false)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.announcements'), 'INSERT'), true)
              and not coalesce(has_table_privilege('authenticated', to_regclass('public.announcements'), 'UPDATE'), true)
              and coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'title', 'INSERT'), false)
              and coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'body', 'INSERT'), false)
              and coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'is_pinned', 'INSERT'), false)
              and coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'title', 'UPDATE'), false)
              and coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'body', 'UPDATE'), false)
              and coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'is_pinned', 'UPDATE'), false)
              and not coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'pinned_at', 'INSERT'), true)
              and not coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'pinned_at', 'UPDATE'), true)
              and not coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'created_by', 'INSERT'), true)
              and not coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'created_by', 'UPDATE'), true)
              and not coalesce(has_column_privilege('authenticated', to_regclass('public.announcements'), 'created_at', 'UPDATE'), true)
              and not coalesce(has_table_privilege('anon', to_regclass('public.announcements'), 'SELECT'), true)
              and not coalesce(has_table_privilege('anon', to_regclass('public.announcements'), 'INSERT'), true)
              and not coalesce(has_table_privilege('anon', to_regclass('public.announcements'), 'UPDATE'), true)
              and not coalesce(has_table_privilege('anon', to_regclass('public.announcements'), 'DELETE'), true)
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'announcements_select_app_user' and qual like '%is_active_self()%' and qual not like '%can_use_app()%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'announcements_insert_leader' and with_check like '%is_active_leader()%' and with_check like '%created_by%' and with_check like '%auth.uid()%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'announcements_update_leader' and qual like '%is_active_leader()%' and with_check like '%is_active_leader()%')
              and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'announcements_delete_leader' and qual like '%is_active_leader()%')) = true) then
    raise exception 'SQA_DB_READY_ANNOUNCEMENTS_GATE';
  end if;
end
$verify$;
