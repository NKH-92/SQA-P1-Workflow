-- Leader-authored announcement board. Every active authenticated user can read,
-- including users who still need to change their password; only active leaders with a
-- current password can create, edit, pin, or delete announcements.

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  is_pinned boolean not null default false,
  pinned_at timestamptz,
  created_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint announcements_title_length_check
    check (char_length(title) between 1 and 200),
  constraint announcements_body_length_check
    check (char_length(body) between 1 and 20000),
  constraint announcements_pin_state_check
    check (
      (is_pinned and pinned_at is not null)
      or (not is_pinned and pinned_at is null)
    )
);

create index announcements_created_by_idx
  on public.announcements(created_by);

create index announcements_board_order_idx
  on public.announcements(
    is_pinned desc,
    pinned_at desc nulls last,
    created_at desc,
    id desc
  );

create or replace function private.enforce_announcement_invariants()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public, private, pg_temp
as $$
begin
  new.title := btrim(new.title);
  new.body := btrim(new.body);

  if tg_op = 'UPDATE' then
    if new.created_by is distinct from old.created_by then
      raise exception 'announcements.created_by cannot be changed';
    end if;
    if new.created_at is distinct from old.created_at then
      raise exception 'announcements.created_at cannot be changed';
    end if;
  end if;

  if new.is_pinned then
    if tg_op = 'INSERT' then
      new.pinned_at := now();
    elsif old.is_pinned is distinct from true then
      new.pinned_at := now();
    else
      new.pinned_at := old.pinned_at;
    end if;
  else
    new.pinned_at := null;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_announcement_invariants() from public;
revoke all on function private.enforce_announcement_invariants() from anon;
revoke all on function private.enforce_announcement_invariants() from authenticated;

create trigger announcements_enforce_invariants
before insert or update on public.announcements
for each row execute function private.enforce_announcement_invariants();

create trigger announcements_set_updated_at
before update on public.announcements
for each row execute function public.set_updated_at();

alter table public.announcements enable row level security;

-- Explicit grants are required for Data API exposure as Supabase removes legacy
-- automatic grants. Keep server-owned columns outside the authenticated write ACL.
revoke all on table public.announcements from public;
revoke all on table public.announcements from anon;
revoke all on table public.announcements from authenticated;

grant select, delete on table public.announcements to authenticated;
grant insert (title, body, is_pinned)
  on table public.announcements to authenticated;
grant update (title, body, is_pinned)
  on table public.announcements to authenticated;
grant all on table public.announcements to service_role;

create policy "announcements_select_app_user"
on public.announcements for select
to authenticated
using ((select public.is_active_self()));

create policy "announcements_insert_leader"
on public.announcements for insert
to authenticated
with check (
  (select public.is_active_leader())
  and created_by = (select auth.uid())
);

create policy "announcements_update_leader"
on public.announcements for update
to authenticated
using ((select public.is_active_leader()))
with check ((select public.is_active_leader()));

create policy "announcements_delete_leader"
on public.announcements for delete
to authenticated
using ((select public.is_active_leader()));

do $$
begin
  if to_regprocedure('private.record_mutation_audit()') is null then
    raise exception 'private.record_mutation_audit() must exist before announcement audit is enabled';
  end if;
end $$;

create trigger announcements_private_audit
after insert or update or delete on public.announcements
for each row execute function private.record_mutation_audit('announcement');
