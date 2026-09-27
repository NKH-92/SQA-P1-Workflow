-- Home-screen pixel office: eight desks in two facing rows of four. The active
-- leader seats people and picks each character's gender; style and personality
-- derive on the client from a stored random seed.
--
-- Every app user reads the same layout through get_office_seats(), which returns
-- only seat, profile id, display name and look fields (members cannot read other
-- profiles directly). The only write path is replace_office_seats(), a leader-only
-- compare-and-swap of the whole layout. The table itself grants nothing to
-- authenticated and has no policies.
--
-- Deliberately not part of the private mutation audit: the layout is decorative,
-- not business data, and the row keeps updated_by/updated_at.

create table public.office_seats (
  seat_index smallint primary key,
  profile_id uuid not null unique
    references public.profiles(id) on delete cascade,
  gender text not null,
  style_seed integer not null,
  updated_by uuid default auth.uid()
    references public.profiles(id) on delete set null,
  updated_at timestamptz not null default clock_timestamp(),
  constraint office_seats_seat_index_check check (seat_index between 1 and 8),
  constraint office_seats_gender_check check (gender in ('male', 'female')),
  constraint office_seats_style_seed_check check (style_seed >= 0)
);

create index office_seats_updated_by_idx
  on public.office_seats(updated_by);

alter table public.office_seats enable row level security;

revoke all on table public.office_seats from public, anon, authenticated;
grant all on table public.office_seats to service_role;

-- Team leaders are read-only everywhere (scripts/sql/verify/95 requires this
-- trigger on every public table).
create trigger reject_team_leader_write
before insert or update or delete on public.office_seats
for each row execute function private.reject_team_leader_business_write();

-- Content revision of the whole layout, including rows whose profile was later
-- deactivated. Any seat, person, gender or seed change produces a new value.
create or replace function private.office_seats_revision()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(coalesce(
    pg_catalog.string_agg(
      seat.seat_index::text || ':' || seat.profile_id::text || ':' || seat.gender || ':' || seat.style_seed::text,
      '|' order by seat.seat_index
    ),
    ''
  ))
  from public.office_seats seat
$$;

revoke all on function private.office_seats_revision() from public, anon, authenticated;

create or replace function public.get_office_seats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return (
    select pg_catalog.jsonb_build_object(
      'revision', private.office_seats_revision(),
      'seats', coalesce(pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'seat_index', seat.seat_index,
          'profile_id', seat.profile_id,
          'name', profile.name,
          'gender', seat.gender,
          'style_seed', seat.style_seed
        ) order by seat.seat_index
      ), '[]'::jsonb)
    )
    from public.office_seats seat
    join public.profiles profile
      on profile.id = seat.profile_id
     and profile.is_active
  );
end;
$$;

revoke all on function public.get_office_seats() from public, anon, authenticated;
grant execute on function public.get_office_seats() to authenticated;

create or replace function public.replace_office_seats(
  p_seats jsonb,
  p_expected_revision text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
  v_deleted integer := 0;
  v_inserted integer := 0;
begin
  if not public.can_manage_team_data() then
    raise exception using
      errcode = '42501',
      message = 'active leader required',
      detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;

  if p_seats is null or pg_catalog.jsonb_typeof(p_seats) is distinct from 'array' then
    raise exception using
      errcode = '22023',
      message = 'office seats must be a json array',
      detail = 'SQA_OFFICE_SEATS_INVALID';
  end if;

  v_count := pg_catalog.jsonb_array_length(p_seats);
  if v_count > 8 or exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_seats) item
     where pg_catalog.jsonb_typeof(item) is distinct from 'object'
        or pg_catalog.jsonb_typeof(item -> 'seat_index') is distinct from 'number'
        or pg_catalog.jsonb_typeof(item -> 'profile_id') is distinct from 'string'
        or pg_catalog.jsonb_typeof(item -> 'gender') is distinct from 'string'
        or pg_catalog.jsonb_typeof(item -> 'style_seed') is distinct from 'number'
        or (item ->> 'seat_index') !~ '^[1-8]$'
        or (item ->> 'style_seed') !~ '^[0-9]{1,10}$'
        or (item ->> 'gender') not in ('male', 'female')
        or (item ->> 'profile_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception using
      errcode = '22023',
      message = 'office seats must be up to 8 {seat_index 1-8, profile_id, gender, style_seed} objects',
      detail = 'SQA_OFFICE_SEATS_INVALID';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_seats) item
     where (item ->> 'style_seed')::bigint > 2147483647
  ) then
    raise exception using
      errcode = '22023',
      message = 'style seed is out of range',
      detail = 'SQA_OFFICE_SEATS_INVALID';
  end if;

  if (select count(distinct item ->> 'seat_index') from pg_catalog.jsonb_array_elements(p_seats) item) <> v_count
     or (select count(distinct (item ->> 'profile_id')::uuid) from pg_catalog.jsonb_array_elements(p_seats) item) <> v_count then
    raise exception using
      errcode = '22023',
      message = 'each seat and each person can appear only once',
      detail = 'SQA_OFFICE_SEATS_DUPLICATE';
  end if;

  if exists (
    select 1
      from pg_catalog.jsonb_array_elements(p_seats) item
     where not exists (
       select 1
         from public.profiles profile
        where profile.id = (item ->> 'profile_id')::uuid
          and profile.is_active
     )
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'only active accounts can be seated',
      detail = 'SQA_OFFICE_SEAT_PROFILE_INACTIVE';
  end if;

  -- One writer at a time, so the compare-and-swap sees the latest committed layout.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('sqa:office-seats'));

  if p_expected_revision is distinct from private.office_seats_revision() then
    raise exception using
      errcode = 'P0001',
      message = 'office layout changed since it was loaded',
      detail = 'SQA_OFFICE_LAYOUT_CONFLICT';
  end if;

  -- Remove every row that is not kept exactly as-is, then insert the new ones.
  -- Deleting first lets people swap seats without tripping unique(profile_id).
  delete from public.office_seats seat
   where not exists (
     select 1
       from pg_catalog.jsonb_array_elements(p_seats) item
      where (item ->> 'seat_index')::smallint = seat.seat_index
        and (item ->> 'profile_id')::uuid = seat.profile_id
        and item ->> 'gender' = seat.gender
        and (item ->> 'style_seed')::integer = seat.style_seed
   );
  get diagnostics v_deleted = row_count;

  insert into public.office_seats (seat_index, profile_id, gender, style_seed, updated_by)
  select (item ->> 'seat_index')::smallint,
         (item ->> 'profile_id')::uuid,
         item ->> 'gender',
         (item ->> 'style_seed')::integer,
         auth.uid()
    from pg_catalog.jsonb_array_elements(p_seats) item
   where not exists (
     select 1
       from public.office_seats seat
      where seat.seat_index = (item ->> 'seat_index')::smallint
   );
  get diagnostics v_inserted = row_count;

  return v_deleted > 0 or v_inserted > 0;
end;
$$;

revoke all on function public.replace_office_seats(jsonb, text) from public, anon, authenticated;
grant execute on function public.replace_office_seats(jsonb, text) to authenticated;

comment on table public.office_seats is
  'Home-screen pixel office layout (8 seats). Read via get_office_seats(), written only via replace_office_seats().';
comment on function public.get_office_seats() is
  'Office layout for any app user: revision plus seat, profile id, display name, gender and style seed of active profiles.';
comment on function public.replace_office_seats(jsonb, text) is
  'Leader-only compare-and-swap of the whole office layout; returns false when nothing changed.';

notify pgrst, 'reload schema';
