#Requires -Version 5.1
param(
  [Parameter(Mandatory = $true)]
  [string]$DatabaseUrl,
  [string]$OutputDir = "backup"
)

$ErrorActionPreference = "Stop"
$date = Get-Date -Format "yyyy-MM-dd"
$outFile = Join-Path $OutputDir "part-ops-$date.sql"

New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null

Write-Host "Dumping to $outFile ..."
supabase db dump --db-url $DatabaseUrl -f $outFile

if (-not (Test-Path $outFile) -or (Get-Item $outFile).Length -eq 0) {
  throw "Backup file missing or empty."
}

Write-Host "Backup OK: $outFile ($((Get-Item $outFile).Length) bytes)"
