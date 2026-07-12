-- P1/P0 hardening: keep password-gated users out of direct member writes,
-- make feedback correction author-scoped, and invalidate project OCC revisions
-- for every assignment mutation path (including the rollback RPC).

drop policy if exists "review_requests_update_self_pending" on public.review_requests;
create policy "review_requests_update_self_pending"
on public.review_requests for update
to authenticated
using (
  public.can_use_app()
  and requester_id = auth.uid()
  and status = 'pending'
)
with check (
  public.can_use_app()
  and requester_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "review_requests_delete_self_pending" on public.review_requests;
create policy "review_requests_delete_self_pending"
on public.review_requests for delete
to authenticated
using (
  public.can_use_app()
  and requester_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "review_feedback_update_leader" on public.review_feedback;
create policy "review_feedback_update_leader"
on public.review_feedback for update
to authenticated
using (
  public.is_active_leader()
  and leader_id = auth.uid()
)
with check (
  public.is_active_leader()
  and leader_id = auth.uid()
);

drop policy if exists "review_feedback_delete_leader" on public.review_feedback;
create policy "review_feedback_delete_leader"
on public.review_feedback for delete
to authenticated
using (
  public.is_active_leader()
  and leader_id = auth.uid()
);

create or replace function public.bump_project_revision_from_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    update public.projects set updated_at = clock_timestamp() where id = old.project_id;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.project_id is distinct from new.project_id then
    update public.projects set updated_at = clock_timestamp() where id = old.project_id;
  end if;
  update public.projects set updated_at = clock_timestamp() where id = new.project_id;
  return new;
end;
$$;

revoke all on function public.bump_project_revision_from_assignment() from public;
revoke execute on function public.bump_project_revision_from_assignment() from anon, authenticated;

drop trigger if exists project_assignments_bump_project_revision on public.project_assignments;
create trigger project_assignments_bump_project_revision
after insert or update or delete on public.project_assignments
for each row execute function public.bump_project_revision_from_assignment();

-- The current frontend uses SECURITY DEFINER RPCs for project assignment writes.
-- Removing direct Data API writes closes the path that could bypass OCC entirely;
-- service-role and function owners retain the ability to execute the RPC bodies.
revoke insert, update, delete on table public.project_assignments from authenticated;
