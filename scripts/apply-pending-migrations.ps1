#Requires -Version 5.1
<#
.SYNOPSIS
  Push local pending migrations to linked or specified project ref and verify key objects.

.PARAMETER ProjectRef
  Supabase project ref. If omitted, uses linked project from `supabase link`.

.PARAMETER AccessToken
  Supabase personal access token. If omitted, uses `supabase login` session or $env:SUPABASE_ACCESS_TOKEN.

.EXAMPLE
  .\scripts\apply-pending-migrations.ps1 -ProjectRef "abcdefghijklmnop" -AccessToken $env:SUPABASE_ACCESS_TOKEN
#>
param(
  [string]$ProjectRef,
  [string]$AccessToken = $env:SUPABASE_ACCESS_TOKEN
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root

if ($AccessToken) {
  $env:SUPABASE_ACCESS_TOKEN = $AccessToken
}

if ($ProjectRef) {
  Write-Host "Linking project ref: $ProjectRef"
  npx supabase link --project-ref $ProjectRef
}

Write-Host "Pushing migrations..."
npx supabase db push

$verificationSql = @"
select proname from pg_proc where pronamespace = 'public'::regnamespace and proname in ('reject_review_request', 'add_review_feedback', 'create_project_with_assignments', 'is_active_leader');
select id from storage.buckets where id = 'review-attachments';
select policyname from pg_policies where tablename = 'review_requests' and policyname in ('review_requests_update_self_pending', 'review_requests_delete_self_pending');
select 'realtime_pub_' || tablename from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'review_requests';
"@

$tempSql = Join-Path ([System.IO.Path]::GetTempPath()) ("supabase-verify-{0}.sql" -f [Guid]::NewGuid().ToString('N'))
try {
  Set-Content -Path $tempSql -Value $verificationSql -Encoding UTF8

  Write-Host "Verifying RPC functions, storage bucket, and review RLS policies..."
  $verifyOutput = npx supabase db query --linked --file $tempSql 2>&1 | Out-String

  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Verification query failed (exit $LASTEXITCODE). Check results:"
    Write-Host $verifyOutput
    exit 1
  }

  $expectedRpc = @(
    'reject_review_request',
    'add_review_feedback',
    'create_project_with_assignments',
    'is_active_leader'
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
