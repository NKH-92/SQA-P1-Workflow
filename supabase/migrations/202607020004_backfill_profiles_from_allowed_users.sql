insert into public.profiles (id, email, name, role)
select auth_user.id, auth_user.email, au.name, au.role
from public.allowed_users au
join auth.users auth_user
  on lower(auth_user.email::text) = lower(au.email::text)
on conflict (id) do update
set email = excluded.email,
    name = excluded.name,
    role = excluded.role,
    updated_at = now();
