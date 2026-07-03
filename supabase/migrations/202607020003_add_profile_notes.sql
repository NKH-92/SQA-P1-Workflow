create table if not exists public.profile_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create index if not exists profile_notes_profile_idx on public.profile_notes(profile_id);

alter table public.profile_notes enable row level security;

drop policy if exists "profile_notes_select_self_or_leader" on public.profile_notes;
drop policy if exists "profile_notes_write_leader" on public.profile_notes;

create policy "profile_notes_select_self_or_leader"
on public.profile_notes for select
to authenticated
using (profile_id = auth.uid() or public.is_leader());

create policy "profile_notes_write_leader"
on public.profile_notes for all
to authenticated
using (public.is_leader())
with check (public.is_leader() and leader_id = auth.uid());
