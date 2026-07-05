#Requires -Version 5.1
# Includes 20260705* migrations when present under supabase/migrations/
$root = Split-Path $PSScriptRoot -Parent
$migrationsDir = Join-Path $root 'supabase\migrations'
$pending = @()
if (Test-Path $migrationsDir) {
  $pending = Get-ChildItem -Path $migrationsDir -Filter '20260705*.sql' -File |
    Sort-Object Name |
    ForEach-Object { "  - $($_.Name)" }
}
$pendingBlock = if ($pending.Count -gt 0) {
  ($pending -join [Environment]::NewLine)
} else {
  '  (none found under supabase/migrations/20260705*.sql)'
}

Write-Host @"
Supabase migration apply helper
================================

1. Install CLI: npm install -g supabase
2. Login:       supabase login
3. Link:        supabase link --project-ref <YOUR_PROJECT_REF>
4. Push:        supabase db push

Or paste SQL from supabase/migrations/ into Supabase SQL Editor (see docs/SUPABASE_MIGRATIONS.md).

Pending migrations (20260705*):
$pendingBlock
"@
