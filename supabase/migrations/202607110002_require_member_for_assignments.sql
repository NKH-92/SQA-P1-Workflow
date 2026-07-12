-- Product and duty assignments must target active member profiles on every write path.
-- Existing triggers already call this function, so replacing it hardens direct DML and
-- both add-only and full-replacement RPCs without changing their signatures.

create or replace function public.validate_assignment_user_active()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.require_profile_role(new.user_id, 'member', tg_table_name || '.user_id');
  if not public.profile_is_active(new.user_id) then
    raise exception '% must reference an active profile', tg_table_name || '.user_id';
  end if;
  return new;
end;
$$;
