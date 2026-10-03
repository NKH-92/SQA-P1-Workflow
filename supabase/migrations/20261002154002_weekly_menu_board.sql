-- Company-wide weekly menu captures: active app users, including team leaders,
-- may publish. This is shared office information, not guarded business data.
-- One fixed object is replaced through the Storage API. No weekly history or
-- abandoned per-upload files accumulate; Storage disposes of replaced versions.
-- All active users intentionally share this single company menu, regardless of
-- the previous uploader. The last completed upload wins.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('weekly-menus', 'weekly-menus', false, 10485760,
        array['image/png', 'image/jpeg', 'image/webp']);

create policy weekly_menus_read on storage.objects
for select to authenticated
using (bucket_id = 'weekly-menus' and name = 'current-menu' and public.can_use_app());

create policy weekly_menus_publish on storage.objects
for insert to authenticated
with check (
  bucket_id = 'weekly-menus'
  and public.can_use_app()
  and name = 'current-menu'
);

create policy weekly_menus_replace on storage.objects
for update to authenticated
using (bucket_id = 'weekly-menus' and name = 'current-menu' and public.can_use_app())
with check (bucket_id = 'weekly-menus' and name = 'current-menu' and public.can_use_app());

-- No client DELETE: the Storage upsert replaces only after a successful upload,
-- so a failed replacement does not delete the menu everyone is currently using.
