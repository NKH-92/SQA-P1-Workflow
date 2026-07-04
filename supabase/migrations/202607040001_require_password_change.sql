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
  update public.profiles
     set must_change_password = false,
         updated_at = now()
   where id = auth.uid()
   returning * into updated_profile;

  return updated_profile;
end;
$$;

grant execute on function public.mark_password_changed() to authenticated;

insert into public.allowed_users (email, name, role)
values
  ('chothdus@hanlim.com', '조소연', 'member'),
  ('hyeong9@hanlim.com', '구하영', 'member'),
  ('jykim1@hanlim.com', '김지윤', 'member'),
  ('chdms213@hanlim.com', '김초은', 'member'),
  ('pyun0806@hanlim.com', '편승훈', 'member'),
  ('nkh92@hanlim.com', '남광현', 'leader'),
  ('hellojs@hanlim.com', '박지수', 'member'),
  ('gunwoo4804@hanlim.com', '이건우', 'member'),
  ('wjddudwn1339@hanlim.com', '정영주', 'member'),
  ('goldyeji@hanlim.com', '전예지', 'member')
on conflict (email) do update
set name = excluded.name,
    role = excluded.role;

update public.profiles profile
   set name = allowed_user.name,
       role = allowed_user.role,
       must_change_password = true,
       updated_at = now()
  from public.allowed_users allowed_user
 where lower(profile.email::text) = lower(allowed_user.email::text)
   and lower(allowed_user.email::text) in (
     'chothdus@hanlim.com',
     'hyeong9@hanlim.com',
     'jykim1@hanlim.com',
     'chdms213@hanlim.com',
     'pyun0806@hanlim.com',
     'nkh92@hanlim.com',
     'hellojs@hanlim.com',
     'gunwoo4804@hanlim.com',
     'wjddudwn1339@hanlim.com',
     'goldyeji@hanlim.com'
   );
