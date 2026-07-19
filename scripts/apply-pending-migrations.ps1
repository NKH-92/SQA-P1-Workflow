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

function Invoke-SupabaseCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Operation,
    [Parameter(Mandatory = $true)]
    [string[]]$Arguments,
    [switch]$CaptureOutput
  )

  $commandOutput = & npx --yes "supabase@$SupabaseCliVersion" @Arguments 2>&1
  $nativeExitCode = $LASTEXITCODE
  $outputText = $commandOutput | Out-String

  if ($nativeExitCode -ne 0) {
    if ($outputText.Trim()) {
      Write-Host $outputText
    }
    throw "SQA_SUPABASE_NATIVE_FAILED: $Operation exited with code $nativeExitCode."
  }

  if ($CaptureOutput) {
    return $outputText
  }
  if ($outputText.Trim()) {
    Write-Host $outputText.TrimEnd()
  }
}

if ($AccessToken) {
  $env:SUPABASE_ACCESS_TOKEN = $AccessToken
}

if ($ProjectRef) {
  Write-Host "Linking project ref: $ProjectRef"
  Invoke-SupabaseCommand -Operation 'link' -Arguments @('link', '--project-ref', $ProjectRef)
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
    $preflightOutput = Invoke-SupabaseCommand -Operation 'stage-b-preflight' -Arguments @(
      'db', 'query', '--linked', '--file', $preflightFile
    ) -CaptureOutput
    if ($preflightOutput -notmatch 'stage_b_storage_handoff_ok') {
      throw 'SQA_REVIEW_ATTACHMENTS_BUCKET_STILL_EXISTS: run the approved Storage API purge and verify objectCount=0, bucketExists=false before Stage B.'
    }
  }
  finally {
    Remove-Item -LiteralPath $preflightFile -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Pushing migrations..."
Invoke-SupabaseCommand -Operation 'db-push' -Arguments @('db', 'push')

$manifestPath = Join-Path $PSScriptRoot 'sql\verify\manifest.json'
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
$readinessFiles = @($manifest.readinessFiles)

Write-Host "Validating canonical readiness manifest..."
& node (Join-Path $PSScriptRoot 'validate-readiness-manifest.mjs')
$manifestExitCode = $LASTEXITCODE
if ($manifestExitCode -ne 0) {
  throw "SQA_DB_READY_MANIFEST: validator exited with code $manifestExitCode."
}

Write-Host "Verifying canonical migration, RLS, RPC, ACL, trigger, and audit contracts..."
foreach ($readinessFileName in $readinessFiles) {
  if ($readinessFileName -notmatch '^\d{2}_[a-z0-9_]+\.sql$') {
    throw "SQA_DB_READY_MANIFEST_PATH: $readinessFileName"
  }
  $readinessFile = Join-Path (Join-Path $PSScriptRoot 'sql\verify') $readinessFileName
  if (-not (Test-Path -LiteralPath $readinessFile)) {
    throw "SQA_DB_READY_MANIFEST_MISSING: $readinessFileName"
  }
  Write-Host "  $readinessFileName"
  $verifyOutput = Invoke-SupabaseCommand -Operation "readiness-$readinessFileName" -Arguments @(
    'db', 'query', '--linked', '--file', $readinessFile
  ) -CaptureOutput
  if ($verifyOutput.Trim()) {
    Write-Host $verifyOutput.TrimEnd()
  }
}

Write-Host "Verification passed: SQA_DB_READY_OK"
