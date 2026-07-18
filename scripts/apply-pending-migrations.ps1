#Requires -Version 5.1
<#
.SYNOPSIS
  Push local pending migrations to linked or specified project ref and verify key objects.

.PARAMETER ProjectRef
  Supabase project ref. If omitted, uses linked project from `supabase link`.

.PARAMETER AccessToken
  Supabase personal access token. If omitted, uses `supabase login` session or $env:SUPABASE_ACCESS_TOKEN.

.PARAMETER SupabaseCliVersion
  Exact Supabase CLI version to run. Defaults to the version used by CI.

.EXAMPLE
  .\scripts\apply-pending-migrations.ps1 -ProjectRef "abcdefghijklmnop" -AccessToken $env:SUPABASE_ACCESS_TOKEN
#>
param(
  [string]$ProjectRef,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN,
  [string]$SupabaseCliVersion = '2.109.1'
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if ($AccessToken) {
  $env:SUPABASE_ACCESS_TOKEN = $AccessToken
}

if ($ProjectRef) {
  Write-Host "Linking project ref: $ProjectRef"
  npx --yes "supabase@$SupabaseCliVersion" link --project-ref $ProjectRef
}

$stageBMigration = Join-Path $root 'supabase\migrations\20260718073243_finalize_review_workflow_hardening.sql'
if (Test-Path -LiteralPath $stageBMigration) {
  $preflightSql = @"
select 'stage_b_storage_handoff_ok' where
  not exists (select 1 from storage.objects where bucket_id = 'review-attachments')
  and not exists (select 1 from storage.buckets where id = 'review-attachments');
"@
  $preflightFile = Join-Path ([System.IO.Path]::GetTempPath()) ("supabase-stage-b-preflight-{0}.sql" -f [Guid]::NewGuid().ToString('N'))
  try {
    Set-Content -Path $preflightFile -Value $preflightSql -Encoding UTF8
    $preflightOutput = npx --yes "supabase@$SupabaseCliVersion" db query --linked --file $preflightFile 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0 -or $preflightOutput -notmatch 'stage_b_storage_handoff_ok') {
      throw 'SQA_REVIEW_ATTACHMENTS_BUCKET_STILL_EXISTS: run the approved Storage API purge and verify objectCount=0, bucketExists=false before Stage B.'
    }
  }
  finally {
    Remove-Item -LiteralPath $preflightFile -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Pushing migrations..."
npx --yes "supabase@$SupabaseCliVersion" db push

$verificationSql = @"
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('reject_review_request', 'add_review_feedback', 'create_project_with_assignments', 'is_active_leader', 'add_product_assignment', 'add_duty_assignment', 'replace_project_assignments_if_current', 'reopen_review_request', 'bump_project_revision_from_assignment');
select 'assignment_rpc_security_ok' where
  (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.add_product_assignment(uuid,uuid)'))
  and (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.add_duty_assignment(uuid,uuid)'))
  and has_function_privilege('authenticated', 'public.add_product_assignment(uuid,uuid)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.add_duty_assignment(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.add_product_assignment(uuid,uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.add_duty_assignment(uuid,uuid)', 'EXECUTE')
  and (select pg_get_function_result(to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)')) = 'timestamp with time zone')
  and (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)'))
  and has_function_privilege('authenticated', 'public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.replace_project_assignments_if_current(uuid,uuid[],timestamp with time zone)', 'EXECUTE');
select 'review_reopen_and_occ_hardening_ok' where
  (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.reopen_review_request(uuid)'))
  and has_function_privilege('authenticated', 'public.reopen_review_request(uuid)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reopen_review_request(uuid)', 'EXECUTE')
  and not has_table_privilege('authenticated', 'public.project_assignments', 'INSERT')
  and not has_table_privilege('authenticated', 'public.project_assignments', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.project_assignments', 'DELETE')
  and (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.bump_project_revision_from_assignment()'))
  and (select proacl is not null and proacl::text not like '%{=X%' and proacl::text not like '%,=X%' from pg_proc where oid = to_regprocedure('public.bump_project_revision_from_assignment()'))
  and not has_function_privilege('authenticated', 'public.bump_project_revision_from_assignment()', 'EXECUTE')
  and not has_function_privilege('anon', 'public.bump_project_revision_from_assignment()', 'EXECUTE')
  and exists (select 1 from pg_trigger where tgrelid = 'public.project_assignments'::regclass and tgname = 'project_assignments_bump_project_revision');
select 'review_activity_transaction_ok' where
  (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.update_review_request_status(uuid,public.review_status)'))
  and (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.reject_review_request(uuid,text)'))
  and (select prosecdef and exists (select 1 from unnest(proconfig) cfg where cfg in ('search_path=""', 'search_path=')) from pg_proc where oid = to_regprocedure('public.add_review_feedback(uuid,text)'))
  and pg_get_functiondef(to_regprocedure('public.update_review_request_status(uuid,public.review_status)')) like '%insert into public.activity_logs%'
  and pg_get_functiondef(to_regprocedure('public.reject_review_request(uuid,text)')) like '%insert into public.activity_logs%'
  and pg_get_functiondef(to_regprocedure('public.add_review_feedback(uuid,text)')) like '%insert into public.activity_logs%'
  and (select proacl is not null and proacl::text not like '%{=X%' and proacl::text not like '%,=X%' from pg_proc where oid = to_regprocedure('public.update_review_request_status(uuid,public.review_status)'))
  and (select proacl is not null and proacl::text not like '%{=X%' and proacl::text not like '%,=X%' from pg_proc where oid = to_regprocedure('public.reject_review_request(uuid,text)'))
  and (select proacl is not null and proacl::text not like '%{=X%' and proacl::text not like '%,=X%' from pg_proc where oid = to_regprocedure('public.add_review_feedback(uuid,text)'))
  and has_function_privilege('authenticated', 'public.update_review_request_status(uuid,public.review_status)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.reject_review_request(uuid,text)', 'EXECUTE')
  and has_function_privilege('authenticated', 'public.add_review_feedback(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.update_review_request_status(uuid,public.review_status)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.reject_review_request(uuid,text)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.add_review_feedback(uuid,text)', 'EXECUTE');
select 'active_leader_password_gate_ok' where
  pg_get_functiondef(to_regprocedure('public.is_active_leader()')) like '%password_is_current()%'
  and pg_get_functiondef(to_regprocedure('public.can_use_app()')) like '%password_is_current()%'
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'review_feedback' and policyname = 'review_feedback_insert_leader' and with_check like '%is_active_leader()%' and with_check like '%leader_id = auth.uid()%');
select 'profile_note_private_audit_ok' where
  exists (
    select 1 from pg_trigger
    where tgrelid = to_regclass('public.profile_notes')
      and tgname = 'profile_notes_private_audit'
      and not tgisinternal
  )
  and exists (
    select 1 from pg_trigger
    where tgrelid = to_regclass('public.announcements')
      and tgname = 'announcements_private_audit'
      and tgfoid = to_regprocedure('private.record_mutation_audit()')
      and not tgisinternal
  )
  and (
    select count(*) = 16 from pg_trigger
    where tgfoid = to_regprocedure('private.record_mutation_audit()')
      and not tgisinternal
  );
select 'authoritative_audit_v3_ok' where
  exists (select 1 from supabase_migrations.schema_migrations where version = '20260718153410')
  and to_regprocedure('private.build_audit_business_snapshot(text,jsonb)') is not null
  and not has_function_privilege('authenticated', 'private.build_audit_business_snapshot(text,jsonb)', 'EXECUTE')
  and not has_function_privilege('anon', 'private.build_audit_business_snapshot(text,jsonb)', 'EXECUTE')
  and exists (select 1 from unnest((select proconfig from pg_proc where oid = to_regprocedure('private.record_mutation_audit()'))) cfg where cfg in ('search_path=""', 'search_path='))
  and (select prosrc like '%v_after := v_new_sanitized%' and prosrc like '%schema_version%' from pg_proc where oid = to_regprocedure('private.record_mutation_audit()'))
  and has_function_privilege('authenticated', 'public.list_audit_events(integer,bigint)', 'EXECUTE')
  and not has_function_privilege('anon', 'public.list_audit_events(integer,bigint)', 'EXECUTE');
select 'announcement_board_ok' where
  exists (select 1 from supabase_migrations.schema_migrations where version = '20260716200422')
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
  and exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'announcements' and policyname = 'announcements_delete_leader' and qual like '%is_active_leader()%');
select 'latest_migration_version_ok' where
  exists (select 1 from supabase_migrations.schema_migrations where version = '20260718153410');
select 'review_stage_b_cleanup_ok' where
  exists (select 1 from supabase_migrations.schema_migrations where version = '20260718073243')
  and exists (select 1 from supabase_migrations.schema_migrations where version = '20260718123250')
  and not exists (select 1 from storage.buckets where id = 'review-attachments')
  and not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'review_attachments_%')
  and not exists (select 1 from pg_attribute where attrelid = 'public.review_requests'::regclass and attname = 'attachment_url' and not attisdropped)
  and to_regprocedure('public.mark_password_changed()') is null
  and not has_table_privilege('authenticated', 'public.review_requests', 'INSERT')
  and not has_table_privilege('authenticated', 'public.review_requests', 'UPDATE')
  and not has_table_privilege('authenticated', 'public.review_requests', 'DELETE')
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
  and exists (select 1 from pg_default_acl where defaclrole = 'postgres'::regrole and defaclnamespace = 0 and defaclobjtype = 'f' and defaclacl::text not like '%{=X%' and defaclacl::text not like '%,=X%' and defaclacl::text not like '%anon=X%' and defaclacl::text not like '%authenticated=X%' and defaclacl::text not like '%service_role=X%');
select 'realtime_pub_' || tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'review_requests';
"@

$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) ("supabase-verify-{0}.sql" -f [Guid]::NewGuid().ToString('N'))
try {
  Set-Content -Path $tempSql -Value $verificationSql -Encoding UTF8

  Write-Host "Verifying RPC functions, Stage B cleanup/ACL, review RLS, and announcement-board invariants..."
  $verifyOutput = npx --yes "supabase@$SupabaseCliVersion" db query --linked --file $tempSql 2>&1 | Out-String

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Verification query failed (exit $LASTEXITCODE). Check results:"
    Write-Host $verifyOutput
    exit 1
  }

  $expectedRpc = @(
    'reject_review_request',
    'add_review_feedback',
    'create_project_with_assignments',
    'is_active_leader',
    'add_product_assignment',
    'add_duty_assignment',
    'replace_project_assignments_if_current',
    'reopen_review_request',
    'bump_project_revision_from_assignment',
    'review_reopen_and_occ_hardening_ok',
    'review_activity_transaction_ok',
    'active_leader_password_gate_ok',
    'assignment_rpc_security_ok',
    'profile_note_private_audit_ok',
    'authoritative_audit_v3_ok',
    'announcement_board_ok',
    'latest_migration_version_ok',
    'review_stage_b_cleanup_ok'
  )

  $missingRpc = @($expectedRpc | Where-Object { $verifyOutput -notmatch [regex]::Escape($_) })
  $missingRealtime = $verifyOutput -notmatch 'realtime_pub_review_requests'

  if ($missingRpc.Count -gt 0 -or $missingRealtime) {
    Write-Warning "Verification incomplete — check results:"
    if ($missingRpc.Count -gt 0) {
      Write-Warning "  Missing verification marker: $($missingRpc -join ', ')"
    }
    if ($missingRealtime) {
      Write-Warning "  Missing realtime publication table: review_requests (202607090001)"
    }
    Write-Host $verifyOutput
    exit 1
  }

  Write-Host "Verification passed."
}
finally {
  if (Test-Path $tempSql) {
    Remove-Item -Path $tempSql -Force
  }
}
