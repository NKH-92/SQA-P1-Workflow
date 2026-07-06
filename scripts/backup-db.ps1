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

Write-Host "Dumping schema to $schemaFile ..."
supabase db dump --db-url $DatabaseUrl -f $schemaFile

Write-Host "Dumping data to $dataFile ..."
supabase db dump --db-url $DatabaseUrl --data-only -f $dataFile

foreach ($file in @($schemaFile, $dataFile)) {
  if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
    throw "Backup file missing or empty: $file"
  }
}

Write-Host "Backup OK:"
Write-Host "  schema: $schemaFile ($((Get-Item $schemaFile).Length) bytes)"
Write-Host "  data:   $dataFile ($((Get-Item $dataFile).Length) bytes)"
