-- Reject external http(s) attachment URLs; storage://review-attachments/ only.

create or replace function public.validate_review_attachment_url()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  storage_prefix constant text := 'storage://review-attachments/';
  path_part text;
begin
  if new.attachment_url is null or btrim(new.attachment_url) = '' then
    return new;
  end if;

  if new.attachment_url not like storage_prefix || '%' then
    raise exception 'attachment must use storage upload (storage://review-attachments/...)';
  end if;

  path_part := substring(new.attachment_url from char_length(storage_prefix) + 1);
  if split_part(path_part, '/', 1) <> auth.uid()::text then
    raise exception 'attachment path must belong to the current user';
  end if;

  return new;
end;
$$;
