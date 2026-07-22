-- Preserve the deployed public_leader_profiles(id, name) API while removing
-- the SECURITY DEFINER view flagged by the Supabase security advisor. The
-- narrow privileged read lives in a fixed-search-path helper; the exposed view
-- runs as the caller and remains gated by can_use_app().

create or replace function private.list_active_leader_profiles()
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select profile.id, profile.name
    from public.profiles profile
   where public.can_use_app()
     and profile.role = 'leader'
     and profile.is_active = true
   order by profile.name, profile.id
$$;

revoke all on function private.list_active_leader_profiles()
from public, anon, authenticated;
grant execute on function private.list_active_leader_profiles()
to authenticated;

create or replace view public.public_leader_profiles
with (security_invoker = true, security_barrier = true)
as
select leader.id, leader.name
  from private.list_active_leader_profiles() leader;

revoke all on table public.public_leader_profiles
from public, anon, authenticated;
grant select on table public.public_leader_profiles
to authenticated;

comment on function private.list_active_leader_profiles() is
  'Compatibility helper for the invoker-rights public_leader_profiles view; returns active leaders only to callers that can use the app.';

notify pgrst, 'reload schema';
