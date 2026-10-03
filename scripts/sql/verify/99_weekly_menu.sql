-- Weekly menu captures are shared office information for all active app users.
do $verify$
begin
  if not exists (select 1 from supabase_migrations.schema_migrations where version = '20261002154002') then
    raise exception 'SQA_DB_READY_WEEKLY_MENU_MIGRATION';
  end if;
  if not exists (
    select 1 from storage.buckets where id = 'weekly-menus' and not public
      and file_size_limit = 10485760
      and allowed_mime_types @> array['image/png', 'image/jpeg', 'image/webp']
      and cardinality(allowed_mime_types) = 3
  ) then
    raise exception 'SQA_DB_READY_WEEKLY_MENU_BUCKET';
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'weekly_menus_read' and cmd = 'SELECT'
      and roles = array['authenticated']::name[]
      and qual like '%weekly-menus%' and qual like '%can_use_app()%' and qual like '%current-menu%'
  ) or not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'weekly_menus_publish' and cmd = 'INSERT'
      and roles = array['authenticated']::name[]
      and with_check like '%weekly-menus%' and with_check like '%can_use_app()%'
      and with_check like '%current-menu%'
  ) or not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and policyname = 'weekly_menus_replace' and cmd = 'UPDATE'
      and roles = array['authenticated']::name[]
      and qual like '%weekly-menus%' and qual like '%can_use_app()%' and qual like '%current-menu%'
      and with_check like '%weekly-menus%' and with_check like '%can_use_app()%' and with_check like '%current-menu%'
  ) or exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
      and cmd in ('DELETE', 'ALL')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%weekly-menus%'
  ) then
    raise exception 'SQA_DB_READY_WEEKLY_MENU_POLICIES';
  end if;
end;
$verify$;
