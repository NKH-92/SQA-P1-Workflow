-- Keep every allowed_users operation gated by an active leader while retaining
-- the direct UPDATE compatibility path required by the expand-first rollout.

drop policy if exists "allowed_users_leader_all" on public.allowed_users;

drop policy if exists "allowed_users_select_leader" on public.allowed_users;
create policy "allowed_users_select_leader"
on public.allowed_users for select
to authenticated
using (public.is_active_leader());

drop policy if exists "allowed_users_insert_leader" on public.allowed_users;
create policy "allowed_users_insert_leader"
on public.allowed_users for insert
to authenticated
with check (
  public.is_active_leader()
  and (created_by is null or public.profile_has_role(created_by, 'leader'))
);

drop policy if exists "allowed_users_delete_leader" on public.allowed_users;
create policy "allowed_users_delete_leader"
on public.allowed_users for delete
to authenticated
using (public.is_active_leader());

drop policy if exists "allowed_users_update_leader_compat" on public.allowed_users;
create policy "allowed_users_update_leader_compat"
on public.allowed_users for update
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());

grant update on table public.allowed_users to authenticated;
