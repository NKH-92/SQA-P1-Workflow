-- Copy this file to supabase/private_seed.local.sql and replace the placeholder
-- values with your real team data. Do not commit the .local.sql file.

insert into public.allowed_users (email, name, role)
values
  ('leader@example.com', '파트장 이름', 'leader'),
  ('member@example.com', '파트원 이름', 'member')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role;

update public.profiles profile
   set name = allowed_user.name,
       role = allowed_user.role,
       must_change_password = true,
       updated_at = now()
  from public.allowed_users allowed_user
 where lower(profile.email::text) = lower(allowed_user.email::text);
