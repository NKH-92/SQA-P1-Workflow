-- Keep the current-leader self-assignment rules from 20260714075451 while
-- evaluating auth.uid() once per statement instead of once per candidate row.

drop policy if exists "project_assignments_insert_leader_member" on public.project_assignments;
create policy "project_assignments_insert_leader_member"
on public.project_assignments for insert
to authenticated
with check (
  public.is_active_leader()
  and (
    public.profile_has_role(user_id, 'member')
    or (
      user_id = (select auth.uid())
      and public.profile_has_role(user_id, 'leader')
    )
  )
);

drop policy if exists "project_assignments_update_leader_member" on public.project_assignments;
create policy "project_assignments_update_leader_member"
on public.project_assignments for update
to authenticated
using (public.is_active_leader())
with check (
  public.is_active_leader()
  and (
    public.profile_has_role(user_id, 'member')
    or (
      user_id = (select auth.uid())
      and public.profile_has_role(user_id, 'leader')
    )
  )
);
