-- Canonical fail-closed readiness checks. Do not weaken without migration and RLS evidence.
do $verify$
begin
  if not ((has_table_privilege('authenticated', 'public.review_requests', 'SELECT')
              and not has_table_privilege('authenticated', 'public.review_requests', 'INSERT')
              and not has_table_privilege('authenticated', 'public.review_requests', 'UPDATE')
              and not has_table_privilege('authenticated', 'public.review_requests', 'DELETE')
              and not exists (select 1 from pg_attribute where attrelid = 'public.review_requests'::regclass and attname = 'attachment_url' and not attisdropped)
              and to_regclass('private.review_status_events') is not null
              and exists (
                select 1 from pg_trigger
                where tgrelid = 'public.review_requests'::regclass
                  and tgname = 'review_requests_record_status_event'
                  and tgenabled in ('O', 'A')
              )) = true) then
    raise exception 'SQA_DB_READY_REVIEW_STATUS_GATE';
  end if;
end
$verify$;

do $verify$
begin
  if not ((exists (
              select 1
                from supabase_migrations.schema_migrations
               where version = '20260723120000'
            )
            and not exists (
              select 1
                from pg_constraint
               where conrelid = 'public.review_requests'::regclass
                 and conname in (
                   'review_requests_title_length_v2_check',
                   'review_requests_description_length_v2_check'
                 )
            )
            and to_regprocedure('private.validate_review_request_input_v2()') is not null
            and not coalesce((
              select prosecdef
                from pg_proc
               where oid = to_regprocedure('private.validate_review_request_input_v2()')
            ), true)
            and coalesce((
              select exists (
                select 1
                  from unnest(proconfig) cfg
                 where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')
              )
                from pg_proc
               where oid = to_regprocedure('private.validate_review_request_input_v2()')
            ), false)
            and not has_function_privilege(
              'authenticated',
              to_regprocedure('private.validate_review_request_input_v2()'),
              'EXECUTE'
            )
            and not has_function_privilege(
              'service_role',
              to_regprocedure('private.validate_review_request_input_v2()'),
              'EXECUTE'
            )
            and coalesce(
              pg_get_functiondef(to_regprocedure('private.validate_review_request_input_v2()'))
                like '%new.title is distinct from old.title%',
              false
            )
            and coalesce(
              pg_get_functiondef(to_regprocedure('private.validate_review_request_input_v2()'))
                like '%new.description is distinct from old.description%',
              false
            )
            and coalesce(
              pg_get_functiondef(to_regprocedure('private.validate_review_request_input_v2()'))
                like '%new.due_date is distinct from old.due_date%',
              false
            )
            and exists (
              select 1
                from pg_trigger
               where tgrelid = 'public.review_requests'::regclass
                 and tgname = 'review_request_input_v2_guard'
                 and tgfoid = to_regprocedure('private.validate_review_request_input_v2()')
                 and tgenabled in ('O', 'A')
            )) = true) then
    raise exception 'SQA_DB_READY_REVIEW_INPUT_CONTRACT_GATE';
  end if;
end
$verify$;
do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260718054122')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260718054124')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260718054127')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260718073243')
              and exists (select 1 from supabase_migrations.schema_migrations where version = '20260718123250')
              and exists (select 1 from pg_enum value join pg_type type on type.oid = value.enumtypid where type.typname = 'review_status' and value.enumlabel = 'withdrawn')
              and to_regclass('public.review_events') is not null
              and to_regclass('public.review_read_receipts') is not null
              and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.review_events')), false)
              and coalesce((select relrowsecurity from pg_class where oid = to_regclass('public.review_read_receipts')), false)
              and not exists (select 1 from storage.buckets where id = 'review-attachments')
              and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'review_attachments_%')
              and not exists (select 1 from pg_attribute where attrelid = 'public.review_requests'::regclass and attname = 'attachment_url' and not attisdropped)
              and to_regprocedure('public.withdraw_review_request(uuid,timestamp with time zone,text)') is not null
              and to_regprocedure('public.void_review_feedback(uuid,timestamp with time zone,text)') is not null
              and to_regprocedure('public.mark_review_seen(uuid)') is not null
              and to_regprocedure('public.mark_all_relevant_reviews_seen()') is not null
              and has_function_privilege('authenticated', to_regprocedure('public.mark_review_seen(uuid)'), 'EXECUTE')
              and not has_function_privilege('anon', to_regprocedure('public.mark_review_seen(uuid)'), 'EXECUTE')
              and exists (select 1 from pg_trigger where tgrelid = 'auth.users'::regclass and tgname = 'on_auth_password_changed' and tgenabled in ('O', 'A'))
              and exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_block_physical_delete' and tgenabled in ('O', 'A'))
              and to_regprocedure('public.mark_password_changed()') is null
              and not exists (select 1 from pg_proc function join pg_namespace namespace on namespace.oid = function.pronamespace where namespace.nspname = 'public' and function.proname in ('mark_password_changed', 'validate_review_attachment_url'))
              and not has_table_privilege('authenticated', 'public.review_feedback', 'INSERT')
              and not has_table_privilege('authenticated', 'public.review_feedback', 'UPDATE')
              and not has_table_privilege('authenticated', 'public.review_feedback', 'DELETE')
              and to_regprocedure('public.update_review_request_status(uuid,public.review_status)') is null
              and to_regprocedure('public.reject_review_request(uuid,text)') is null
              and to_regprocedure('public.reopen_review_request(uuid)') is null
              and to_regprocedure('public.resubmit_review_request(uuid,text)') is null
              and not has_schema_privilege('anon', 'public', 'USAGE')
              and has_schema_privilege('authenticated', 'public', 'USAGE')
              and not has_schema_privilege('authenticated', 'public', 'CREATE')
              and has_schema_privilege('service_role', 'public', 'USAGE')
              and not has_schema_privilege('service_role', 'public', 'CREATE')
              and not has_schema_privilege('authenticated', 'private', 'USAGE')
              and has_schema_privilege('service_role', 'private', 'USAGE')
              and not has_schema_privilege('service_role', 'private', 'CREATE')
              and not exists (select 1 from pg_class object where object.relnamespace = 'public'::regnamespace and object.relkind in ('r', 'p') and not object.relrowsecurity)
              and not exists (select 1 from pg_class object where object.relnamespace = 'public'::regnamespace and object.relkind in ('r', 'p', 'v', 'm') and (has_table_privilege('anon', object.oid, 'SELECT') or has_table_privilege('anon', object.oid, 'INSERT') or has_table_privilege('anon', object.oid, 'UPDATE') or has_table_privilege('anon', object.oid, 'DELETE')))
              and not exists (select 1 from pg_class object where object.relnamespace = 'public'::regnamespace and object.relkind = 'S' and (has_sequence_privilege('anon', object.oid, 'USAGE') or has_sequence_privilege('anon', object.oid, 'SELECT') or has_sequence_privilege('anon', object.oid, 'UPDATE')))
              and not exists (
                select 1
                  from pg_catalog.pg_proc function
                 where function.pronamespace = 'public'::pg_catalog.regnamespace
                   and pg_catalog.has_function_privilege('anon', function.oid, 'EXECUTE')
                   and not exists (
                     select 1
                       from pg_catalog.pg_depend dependency
                       join pg_catalog.pg_extension extension
                         on extension.oid = dependency.refobjid
                      where dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass
                        and dependency.objid = function.oid
                        and dependency.objsubid = 0
                        and dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass
                        and dependency.refobjsubid = 0
                        and dependency.deptype = 'e'
                   )
              )
              and exists (select 1 from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f' and defaclacl::text not like '%{=X%' and defaclacl::text not like '%,=X%' and defaclacl::text not like '%anon=X%' and defaclacl::text not like '%authenticated=X%' and defaclacl::text not like '%service_role=X%')
              and (select count(distinct defaclobjtype) = 3 from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 'public'::regnamespace and defaclobjtype in ('r', 'S', 'f'))
              and exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'audit_events' and column_name = 'changed_fields')
              and exists (select 1 from information_schema.columns where table_schema = 'private' and table_name = 'audit_events' and column_name = 'before_delta')
              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'product_change_tasks' and column_name = 'cancel_kind')
              and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'change_applications' and column_name = 'archive_origin')
              and to_regprocedure('public.restore_product_change_scope(uuid,text)') is not null) = true) then
    raise exception 'SQA_DB_READY_REVIEW_HARDENING_GATE';
  end if;
end
$verify$;

do $verify$
begin
  if not ((not exists (select 1 from pg_policies where schemaname = 'public' and tablename in ('review_requests', 'review_feedback') and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
              and not has_table_privilege('authenticated', 'public.review_requests', 'INSERT')
              and not has_table_privilege('authenticated', 'public.review_requests', 'UPDATE')
              and not has_table_privilege('authenticated', 'public.review_requests', 'DELETE')
              and not has_table_privilege('authenticated', 'public.review_feedback', 'INSERT')
              and not has_table_privilege('authenticated', 'public.review_feedback', 'UPDATE')
              and not has_table_privilege('authenticated', 'public.review_feedback', 'DELETE')
              and coalesce(pg_get_functiondef(to_regprocedure('public.is_active_leader()')) like '%password_is_current()%', false)
              and not has_table_privilege('authenticated', 'public.project_assignments', 'INSERT')
              and not has_table_privilege('authenticated', 'public.project_assignments', 'UPDATE')
              and not has_table_privilege('authenticated', 'public.project_assignments', 'DELETE')
              and to_regprocedure('public.bump_project_revision_from_assignment()') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.bump_project_revision_from_assignment()')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.bump_project_revision_from_assignment()')), false)
              and coalesce((select proacl is not null and proacl::text not like '%{=X%' and proacl::text not like '%,=X%' from pg_proc where oid = to_regprocedure('public.bump_project_revision_from_assignment()')), false)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.bump_project_revision_from_assignment()'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.bump_project_revision_from_assignment()'), 'EXECUTE'), true)
              and exists (select 1 from pg_trigger where tgrelid = 'public.project_assignments'::regclass and tgname = 'project_assignments_bump_project_revision' and tgenabled in ('O', 'A'))) = true) then
    raise exception 'SQA_DB_READY_DIRECT_WRITE_GATE';
  end if;
end
$verify$;

do $verify$
begin
  if not ((exists (select 1 from supabase_migrations.schema_migrations where version = '20260715013615')
              and exists (select 1 from pg_attribute where attrelid = 'public.review_requests'::regclass and attname = 'review_round' and attnotnull and not attisdropped)
              and exists (select 1 from pg_attribute where attrelid = 'public.review_requests'::regclass and attname = 'rejection_count' and attnotnull and not attisdropped)
              and exists (select 1 from pg_attribute where attrelid = 'public.review_requests'::regclass and attname = 'last_submitted_at' and attnotnull and not attisdropped)
              and exists (select 1 from pg_constraint where conrelid = 'public.review_requests'::regclass and conname = 'review_requests_review_round_check' and convalidated)
              and exists (select 1 from pg_constraint where conrelid = 'public.review_requests'::regclass and conname = 'review_requests_rejection_count_check' and convalidated)
              and exists (select 1 from pg_attribute where attrelid = 'public.review_feedback'::regclass and attname = 'author_role' and attnotnull and not attisdropped)
              and exists (select 1 from pg_trigger where tgrelid = 'public.review_feedback'::regclass and tgname = 'review_feedback_validate_leader' and tgfoid = to_regprocedure('public.validate_review_feedback_leader()') and tgenabled in ('O', 'A'))
              and not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'review_requests' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL'))
              and not has_column_privilege('authenticated', 'public.review_requests', 'review_round', 'UPDATE')
              and not has_column_privilege('authenticated', 'public.review_requests', 'rejection_count', 'UPDATE')
              and not has_column_privilege('authenticated', 'public.review_requests', 'last_submitted_at', 'UPDATE')
              and to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)')), false)
              and coalesce(has_function_privilege('authenticated', to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)'), 'EXECUTE'), false)
              and not coalesce(has_function_privilege('anon', to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)'), 'EXECUTE'), true)
              and not coalesce(has_function_privilege('authenticated', to_regprocedure('public.resubmit_review_request(uuid,text)'), 'EXECUTE'), false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)')) like '%for update%', false)
              and coalesce(pg_get_functiondef(to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)')) like '%p_expected_updated_at%', false)) = true) then
    raise exception 'SQA_DB_READY_REVIEW_RESUBMISSION_GATE';
  end if;
end
$verify$;

do $verify$
begin
  if not ((not exists (
              select 1 from pg_policies
               where schemaname = 'public'
                 and (coalesce(qual, '') like '%is_leader()%' or coalesce(with_check, '') like '%is_leader()%')
                 and coalesce(qual, '') not like '%is_active_leader()%'
                 and coalesce(with_check, '') not like '%is_active_leader()%'
            )) = true) then
    raise exception 'SQA_DB_READY_LEADER_POLICY_GATE';
  end if;
end
$verify$;

do $verify$
begin
  if not ((to_regprocedure('public.approve_review_request(uuid,timestamp with time zone)') is not null
              and to_regprocedure('public.reject_review_request(uuid,timestamp with time zone,text)') is not null
              and to_regprocedure('public.add_review_feedback(uuid,text)') is not null
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.approve_review_request(uuid,timestamp with time zone)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.approve_review_request(uuid,timestamp with time zone)')), false)
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.reject_review_request(uuid,timestamp with time zone,text)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.reject_review_request(uuid,timestamp with time zone,text)')), false)
              and coalesce((select prosecdef from pg_proc where oid = to_regprocedure('public.add_review_feedback(uuid,text)')), false)
              and coalesce((select exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=' || chr(34) || chr(34), 'search_path=')) from pg_proc where oid = to_regprocedure('public.add_review_feedback(uuid,text)')), false)
              and has_function_privilege('authenticated', to_regprocedure('public.approve_review_request(uuid,timestamp with time zone)'), 'EXECUTE')
              and has_function_privilege('authenticated', to_regprocedure('public.reject_review_request(uuid,timestamp with time zone,text)'), 'EXECUTE')
              and has_function_privilege('authenticated', to_regprocedure('public.add_review_feedback(uuid,text)'), 'EXECUTE')
              and not has_function_privilege('anon', to_regprocedure('public.approve_review_request(uuid,timestamp with time zone)'), 'EXECUTE')
              and not has_function_privilege('anon', to_regprocedure('public.reject_review_request(uuid,timestamp with time zone,text)'), 'EXECUTE')
              and not has_function_privilege('anon', to_regprocedure('public.add_review_feedback(uuid,text)'), 'EXECUTE')
              and to_regprocedure('public.update_review_request_status(uuid,public.review_status)') is null
              and to_regprocedure('public.reject_review_request(uuid,text)') is null
              and exists (select 1 from pg_trigger where tgrelid = 'public.review_requests'::regclass and tgname = 'review_requests_record_status_event' and tgenabled in ('O', 'A'))
              and exists (select 1 from pg_trigger where tgrelid = 'public.review_feedback'::regclass and tgname = 'review_feedback_record_event' and tgenabled in ('O', 'A'))) = true) then
    raise exception 'SQA_DB_READY_REVIEW_ACTIVITY_GATE';
  end if;
end
$verify$;
