-- Remove drifted role-only leader write policies on the hosted database.
--
-- 202607040002 replaced the broad `FOR ALL` leader-write policies on projects and
-- project_assignments with per-command policies, and 202607050004 gated those on
-- public.is_active_leader(). The originals (projects_write_leader,
-- project_assignments_write_leader, both `using/with check is_leader()`) were
-- dropped in 202607040002, but they still linger on the hosted database as drift.
-- Because permissive policies are OR-ed, these leftovers re-open a role-only write
-- path that bypasses the active/password gate (an inactive or password-pending
-- leader could still write). The DB Migrate readiness gate flags them.
--
-- Drop the leftovers. Leader access is fully preserved by the remaining policies:
--   * SELECT  -> projects_select_assigned_or_leader / project_assignments_select_self_or_leader
--   * INSERT/UPDATE/DELETE -> the per-command projects_* / project_assignments_*
--     policies, all gated on is_active_leader().
-- `drop policy if exists` is idempotent: a no-op on a correctly migrated database
-- where these policies no longer exist.

drop policy if exists "projects_write_leader" on public.projects;
drop policy if exists "project_assignments_write_leader" on public.project_assignments;
