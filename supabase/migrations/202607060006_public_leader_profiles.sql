-- Minimal leader profile visibility for members (id + name only).
-- View runs as owner so members can read leader names without full profiles access.

create or replace view public.public_leader_profiles as
select id, name
from public.profiles
where role = 'leader'
  and is_active = true;

revoke all on public.public_leader_profiles from public;
grant select on public.public_leader_profiles to authenticated;
