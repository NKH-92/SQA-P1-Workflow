-- Owner-executed view must not bypass active/password-change access gating.
-- It still exposes only active leader id/name to authenticated app users.

create or replace view public.public_leader_profiles as
select id, name
from public.profiles
where public.can_use_app()
  and role = 'leader'
  and is_active = true;

alter view public.public_leader_profiles set (security_invoker = false);
revoke all on public.public_leader_profiles from public;
grant select on public.public_leader_profiles to authenticated;
