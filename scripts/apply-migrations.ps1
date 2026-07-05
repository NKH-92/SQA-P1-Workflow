#Requires -Version 5.1
Write-Host @"
Supabase migration apply helper
================================

1. Install CLI: npm install -g supabase
2. Login:       supabase login
3. Link:        supabase link --project-ref <YOUR_PROJECT_REF>
4. Push:        supabase db push

Or paste SQL from supabase/migrations/ into Supabase SQL Editor (see docs/SUPABASE_MIGRATIONS.md).

Pending migrations (20260705*):
  - 202607050001_member_review_update_delete.sql
  - 202607050002_review_attachments_storage.sql
  - 202607050003_profile_is_active.sql
"@
