-- Enforce first-login password change at the RLS layer (not just the UI gate),
-- restore member visibility of leader names, and lock down the last-active-leader counter.
--
-- Why this exists:
--   must_change_password was previously only a client-side screen gate (src/App.tsx).
--   A session obtained with the shared initial password could skip the screen and call
--   the REST/RPC API directly, acting with the target user's full permissions.
--   can_use_app() and is_active_leader() are referenced by every member- and leader-facing
--   policy (see 202607050004), so adding the password condition to those two functions
--   enforces "change password before doing anything" everywhere at once.
--
--   The profiles SELECT policy keeps its `id = auth.uid()` branch, so a user who still
--   must change their password can always read their OWN row (the app needs it to render
--   the change screen). mark_password_changed() is SECURITY DEFINER and independent, so
--   completing the change still works while blocked.

-- true only when the current user's profile exists and no longer requires a change.
create or replace function public.password_is_current()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select not must_change_password from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.password_is_current() from public;
revoke execute on function public.password_is_current() from anon;
grant execute on function public.password_is_current() to authenticated;

-- can_use_app(): active AND password already changed. (was: is_active_self())
create or replace function public.can_use_app()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_self() and public.password_is_current();
$$;

-- is_active_leader(): leader AND active AND password already changed.
-- (was: is_leader() and is_active_self())
create or replace function public.is_active_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_leader() and public.is_active_self() and public.password_is_current();
$$;

-- Re-assert least-privilege grants from 202607070001/070002 (create-or-replace preserves
-- ACLs, but we restate them so this migration is self-contained).
revoke all on function public.can_use_app() from public;
revoke execute on function public.can_use_app() from anon;
grant execute on function public.can_use_app() to authenticated;

revoke all on function public.is_active_leader() from public;
revoke execute on function public.is_active_leader() from anon;
grant execute on function public.is_active_leader() to authenticated;

-- Restore member-visible leader names.
--   202607070001 set security_invoker = true, which made this view honor the querying
--   member's own profiles RLS (self-row only), so members saw zero leader rows and the
--   app fell back to the literal "파트장". The view exposes only id + name of active
--   leaders and is granted to authenticated only, so running it as owner is the intended,
--   column-limited exposure.
alter view public.public_leader_profiles set (security_invoker = false);

-- Least-privilege: the last-active-leader counter (added in 202607070005) was left with
-- the default PUBLIC execute grant. It leaks the active-leader count to anon; lock it down.
revoke all on function public.count_active_leaders_except(uuid) from public;
revoke execute on function public.count_active_leaders_except(uuid) from anon;
grant execute on function public.count_active_leaders_except(uuid) to authenticated;
