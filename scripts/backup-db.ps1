#Requires -Version 5.1
param(
  [string]$DatabaseUrl = $env:DATABASE_URL,
  [string]$OutputDir = "backup"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($DatabaseUrl)) {
  throw "DATABASE_URL environment variable is required. Example: `$env:DATABASE_URL = '<connection-string>'"
}

$date = Get-Date -Format "yyyy-MM-dd"
$schemaFile = Join-Path $OutputDir "sqa-p1-workflow-$date-schema.sql"
$dataFile = Join-Path $OutputDir "sqa-p1-workflow-$date-data.sql"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

# Remove same-day files first so a failed rerun cannot pass on a stale dump.
foreach ($file in @($schemaFile, $dataFile)) {
  Remove-Item -LiteralPath $file -Force -ErrorAction SilentlyContinue
}

# Windows PowerShell 5.1 does not stop on native exit codes; check $LASTEXITCODE right after each call.
Write-Host "Dumping schema to $schemaFile ..."
supabase db dump --db-url $DatabaseUrl -f $schemaFile
if ($LASTEXITCODE -ne 0) {
  throw "supabase db dump failed (exit $LASTEXITCODE): $schemaFile"
}

Write-Host "Dumping data to $dataFile ..."
supabase db dump --db-url $DatabaseUrl --data-only -f $dataFile
if ($LASTEXITCODE -ne 0) {
  throw "supabase db dump failed (exit $LASTEXITCODE): $dataFile"
}

foreach ($file in @($schemaFile, $dataFile)) {
  if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
    throw "Backup file missing or empty: $file"
  }
}

# Same acceptance check as docs/OPERATIONS.md manual backup: schema has CREATE TABLE, data has COPY or INSERT.
if (-not (Select-String -LiteralPath $schemaFile -Pattern 'CREATE TABLE' -SimpleMatch -Quiet)) {
  throw "Schema dump has no CREATE TABLE statement: $schemaFile"
}
if (-not (Select-String -LiteralPath $dataFile -Pattern '^\s*(COPY|INSERT)\b' -Quiet)) {
  throw "Data dump has no COPY or INSERT statement: $dataFile"
}

Write-Host "Backup OK:"
Write-Host "  schema: $schemaFile ($((Get-Item $schemaFile).Length) bytes)"
Write-Host "  data:   $dataFile ($((Get-Item $dataFile).Length) bytes)"
