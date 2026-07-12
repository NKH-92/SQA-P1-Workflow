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
    where tgrelid = 'public.profile_notes'::regclass
      and tgname = 'profile_notes_private_audit'
      and not tgisinternal
  )
  and (
    select count(*) >= 12 from pg_trigger
    where tgfoid = to_regprocedure('private.record_mutation_audit()')
      and not tgisinternal
  );
select 'latest_migration_version_ok' where
  exists (select 1 from supabase_migrations.schema_migrations where version = '202607110011');
select id from storage.buckets where id = 'review-attachments';
select policyname from pg_policies where tablename = 'review_requests' and policyname in ('review_requests_update_self_pending', 'review_requests_delete_self_pending');
select 'realtime_pub_' || tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'review_requests';
"@

$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) ("supabase-verify-{0}.sql" -f [Guid]::NewGuid().ToString('N'))
try {
  Set-Content -Path $tempSql -Value $verificationSql -Encoding UTF8

  Write-Host "Verifying RPC functions, storage bucket, and review RLS policies..."
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
    'latest_migration_version_ok'
  )
  $expectedPolicies = @(
    'review_requests_update_self_pending',
    'review_requests_delete_self_pending'
  )

  $missingRpc = @($expectedRpc | Where-Object { $verifyOutput -notmatch [regex]::Escape($_) })
  $missingBucket = $verifyOutput -notmatch 'review-attachments'
  $missingPolicies = @($expectedPolicies | Where-Object { $verifyOutput -notmatch [regex]::Escape($_) })
  $missingRealtime = $verifyOutput -notmatch 'realtime_pub_review_requests'

  if ($missingRpc.Count -gt 0 -or $missingBucket -or $missingPolicies.Count -gt 0 -or $missingRealtime) {
    Write-Warning "Verification incomplete — check results:"
    if ($missingRpc.Count -gt 0) {
      Write-Warning "  Missing RPC: $($missingRpc -join ', ')"
    }
    if ($missingBucket) {
      Write-Warning "  Missing storage bucket: review-attachments"
    }
    if ($missingPolicies.Count -gt 0) {
      Write-Warning "  Missing policies: $($missingPolicies -join ', ')"
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
