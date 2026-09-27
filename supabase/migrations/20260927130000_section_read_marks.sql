-- Home-screen office alerts: per-person "last checked" marks for the sections
-- whose news review_read_receipts does not cover (announcements, the caller's
-- project assignments, and change applications). The client compares the ids it
-- can see now (announcements by others, the caller's assignment ids, the
-- caller's pending change task ids or, for the leader, change applications that
-- wait for a decision) with the ids stored at the caller's last visit; anything
-- missing from the mark is new.
--
-- Keys are opaque to the database: a mark only changes the caller's own alert
-- state, so mark_section_seen() does not re-derive visibility. Each call
-- replaces the section's keys with what the caller saw, which keeps a row
-- bounded by the currently visible items.
--
-- Team leaders stay read-only (scripts/sql/verify/95 requires the write guard on
-- every public table except review_read_receipts); they get no office alerts,
-- just like the notification center and the navigation badges.
--
-- Deliberately not part of the private mutation audit: read state is personal
-- UI state, like review_read_receipts.

create table public.section_read_marks (
  user_id uuid not null
    references public.profiles(id) on delete cascade,
  section text not null,
  seen_keys uuid[] not null default '{}'::uuid[],
  seen_at timestamptz not null default clock_timestamp(),
  constraint section_read_marks_pkey primary key (user_id, section),
  constraint section_read_marks_section_check
    check (section in ('announcements', 'projects', 'change-applications')),
  constraint section_read_marks_keys_check
    check (cardinality(seen_keys) <= 500 and array_position(seen_keys, null) is null)
);

alter table public.section_read_marks enable row level security;

revoke all on table public.section_read_marks from public, anon, authenticated;
grant all on table public.section_read_marks to service_role;

create trigger reject_team_leader_write
before insert or update or delete on public.section_read_marks
for each row execute function private.reject_team_leader_business_write();

create or replace function public.get_section_read_marks()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'user_id', mark.user_id,
        'section', mark.section,
        'seen_keys', pg_catalog.to_jsonb(mark.seen_keys),
        'seen_at', mark.seen_at
      ) order by mark.section
    )
    from public.section_read_marks mark
    where mark.user_id = auth.uid()
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_section_read_marks() from public, anon, authenticated;
grant execute on function public.get_section_read_marks() to authenticated;

create or replace function public.mark_section_seen(p_section text, p_keys uuid[])
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_seen_at timestamptz := pg_catalog.clock_timestamp();
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using
      errcode = '42501',
      message = 'active app user required',
      detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  if p_section is null or p_section not in ('announcements', 'projects', 'change-applications') then
    raise exception using
      errcode = '22023',
      message = 'unknown section',
      detail = 'SQA_SECTION_INVALID';
  end if;

  if p_keys is null
     or pg_catalog.cardinality(p_keys) > 500
     or pg_catalog.array_position(p_keys, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'seen keys must be up to 500 ids',
      detail = 'SQA_SECTION_KEYS_INVALID';
  end if;

  insert into public.section_read_marks (user_id, section, seen_keys, seen_at)
  values (
    v_actor_id,
    p_section,
    coalesce(
      (select pg_catalog.array_agg(distinct seen_key order by seen_key) from pg_catalog.unnest(p_keys) as seen_key),
      '{}'::uuid[]
    ),
    v_seen_at
  )
  on conflict (user_id, section) do update
    set seen_keys = excluded.seen_keys,
        seen_at = excluded.seen_at;

  return v_seen_at;
end;
$$;

revoke all on function public.mark_section_seen(text, uuid[]) from public, anon, authenticated;
grant execute on function public.mark_section_seen(text, uuid[]) to authenticated;

comment on table public.section_read_marks is
  'Per-person ids seen at the last visit of announcements, projects and change applications (home office alerts).';
comment on function public.get_section_read_marks() is
  'Returns only the caller''s section read marks.';
comment on function public.mark_section_seen(text, uuid[]) is
  'Replaces the caller''s seen ids for one section using database time. Team leaders are rejected by the write guard.';
