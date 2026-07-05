#Requires -Version 5.1
<#
.SYNOPSIS
  Apply pending Supabase migrations (202607050004, 202607050005) to a linked or remote project.

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

Write-Host "Verifying RPC functions..."
npx supabase db execute --sql @"
select proname
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('reject_review_request', 'add_review_feedback', 'create_project_with_assignments', 'is_active_leader');
"@

Write-Host "Done."
