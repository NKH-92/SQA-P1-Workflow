alter table public.profiles
add column if not exists must_change_password boolean not null default true;

create or replace function public.mark_password_changed()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_profile public.profiles;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to mark password changed.';
  end if;

  update public.profiles
     set must_change_password = false,
         updated_at = now()
   where id = auth.uid()
   returning * into updated_profile;

  if updated_profile.id is null then
    raise exception 'Profile not found for current user.';
  end if;

  return updated_profile;
end;
$$;

revoke all on function public.mark_password_changed() from public;
grant execute on function public.mark_password_changed() to authenticated;
