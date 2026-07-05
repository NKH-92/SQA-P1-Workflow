alter table public.duties
  add column if not exists assignee_label text,
  add column if not exists notes text;
