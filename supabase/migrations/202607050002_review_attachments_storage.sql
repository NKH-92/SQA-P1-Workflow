insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-attachments',
  'review-attachments',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png',
    'image/jpeg',
    'text/plain',
    'application/zip'
  ]
)
on conflict (id) do update
set file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "review_attachments_select_self_or_leader"
on storage.objects for select
to authenticated
using (
  bucket_id = 'review-attachments'
  and (
    public.is_leader()
    or auth.uid()::text = split_part(name, '/', 1)
  )
);

create policy "review_attachments_insert_self"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'review-attachments'
  and auth.uid()::text = split_part(name, '/', 1)
);

create policy "review_attachments_delete_self_or_leader"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'review-attachments'
  and (
    public.is_leader()
    or auth.uid()::text = split_part(name, '/', 1)
  )
);
