-- Require active profiles for app access and apply can_use_app across member-facing policies.

create or replace function public.is_active_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_leader() and public.is_active_self();
$$;

create or replace function public.can_use_app()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_active_self();
$$;

drop policy if exists "profiles_select_self_or_leader" on public.profiles;
create policy "profiles_select_self_or_leader"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_active_leader());

drop policy if exists "profiles_update_leader" on public.profiles;
create policy "profiles_update_leader"
on public.profiles for update
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());

drop policy if exists "allowed_users_leader_all" on public.allowed_users;
create policy "allowed_users_leader_all"
on public.allowed_users for all
to authenticated
using (public.is_active_leader())
with check (
  public.is_active_leader()
  and (created_by is null or public.profile_has_role(created_by, 'leader'))
);

drop policy if exists "profile_notes_select_self_or_leader" on public.profile_notes;
create policy "profile_notes_select_self_or_leader"
on public.profile_notes for select
to authenticated
using (
  (public.can_use_app() and profile_id = auth.uid())
  or public.is_active_leader()
);

drop policy if exists "profile_notes_write_leader" on public.profile_notes;
create policy "profile_notes_write_leader"
on public.profile_notes for all
to authenticated
using (public.is_active_leader())
with check (
  public.is_active_leader()
  and leader_id = auth.uid()
  and public.profile_has_role(profile_id, 'member')
  and public.profile_has_role(leader_id, 'leader')
);

drop policy if exists "products_select_assigned_or_leader" on public.products;
create policy "products_select_assigned_or_leader"
on public.products for select
to authenticated
using (
  public.is_active_leader()
  or (
    public.can_use_app()
    and exists (
      select 1
        from public.product_assignments pa
       where pa.product_id = products.id
         and pa.user_id = auth.uid()
    )
  )
);

drop policy if exists "products_write_leader" on public.products;
create policy "products_write_leader"
on public.products for all
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());

drop policy if exists "product_assignments_select_self_or_leader" on public.product_assignments;
create policy "product_assignments_select_self_or_leader"
on public.product_assignments for select
to authenticated
using (public.can_use_app() and (user_id = auth.uid() or public.is_active_leader()));

drop policy if exists "product_assignments_write_leader" on public.product_assignments;
create policy "product_assignments_write_leader"
on public.product_assignments for all
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());

drop policy if exists "duties_select_assigned_or_leader" on public.duties;
create policy "duties_select_assigned_or_leader"
on public.duties for select
to authenticated
using (
  public.is_active_leader()
  or (
    public.can_use_app()
    and exists (
      select 1
        from public.duty_assignments da
       where da.duty_id = duties.id
         and da.user_id = auth.uid()
    )
  )
);

drop policy if exists "duties_write_leader" on public.duties;
create policy "duties_write_leader"
on public.duties for all
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());

drop policy if exists "duty_assignments_select_self_or_leader" on public.duty_assignments;
create policy "duty_assignments_select_self_or_leader"
on public.duty_assignments for select
to authenticated
using (public.can_use_app() and (user_id = auth.uid() or public.is_active_leader()));

drop policy if exists "duty_assignments_write_leader" on public.duty_assignments;
create policy "duty_assignments_write_leader"
on public.duty_assignments for all
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());

drop policy if exists "review_requests_select_self_or_leader" on public.review_requests;
create policy "review_requests_select_self_or_leader"
on public.review_requests for select
to authenticated
using (public.can_use_app() and (requester_id = auth.uid() or public.is_active_leader()));

drop policy if exists "review_requests_update_leader" on public.review_requests;
create policy "review_requests_update_leader"
on public.review_requests for update
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());

drop policy if exists "review_requests_delete_leader" on public.review_requests;
create policy "review_requests_delete_leader"
on public.review_requests for delete
to authenticated
using (public.is_active_leader());

drop policy if exists "review_feedback_select_requester_or_leader" on public.review_feedback;
create policy "review_feedback_select_requester_or_leader"
on public.review_feedback for select
to authenticated
using (
  public.is_active_leader()
  or (
    public.can_use_app()
    and exists (
      select 1
        from public.review_requests rr
       where rr.id = review_feedback.review_request_id
         and rr.requester_id = auth.uid()
    )
  )
);

drop policy if exists "review_feedback_insert_leader" on public.review_feedback;
create policy "review_feedback_insert_leader"
on public.review_feedback for insert
to authenticated
with check (
  public.is_active_leader()
  and leader_id = auth.uid()
  and public.profile_has_role(leader_id, 'leader')
);

drop policy if exists "review_feedback_update_leader" on public.review_feedback;
create policy "review_feedback_update_leader"
on public.review_feedback for update
to authenticated
using (public.is_active_leader())
with check (
  public.is_active_leader()
  and public.profile_has_role(leader_id, 'leader')
);

drop policy if exists "review_feedback_delete_leader" on public.review_feedback;
create policy "review_feedback_delete_leader"
on public.review_feedback for delete
to authenticated
using (public.is_active_leader());

drop policy if exists "projects_select_assigned_or_leader" on public.projects;
create policy "projects_select_assigned_or_leader"
on public.projects for select
to authenticated
using (
  public.is_active_leader()
  or (
    public.can_use_app()
    and exists (
      select 1
        from public.project_assignments pa
       where pa.project_id = projects.id
         and pa.user_id = auth.uid()
    )
  )
);

drop policy if exists "projects_insert_leader_creator" on public.projects;
create policy "projects_insert_leader_creator"
on public.projects for insert
to authenticated
with check (
  public.is_active_leader()
  and created_by = auth.uid()
  and public.profile_has_role(created_by, 'leader')
);

drop policy if exists "projects_update_leader" on public.projects;
create policy "projects_update_leader"
on public.projects for update
to authenticated
using (public.is_active_leader())
with check (
  public.is_active_leader()
  and public.profile_has_role(created_by, 'leader')
);

drop policy if exists "projects_delete_leader" on public.projects;
create policy "projects_delete_leader"
on public.projects for delete
to authenticated
using (public.is_active_leader());

drop policy if exists "project_assignments_select_self_or_leader" on public.project_assignments;
create policy "project_assignments_select_self_or_leader"
on public.project_assignments for select
to authenticated
using (public.can_use_app() and (user_id = auth.uid() or public.is_active_leader()));

drop policy if exists "project_assignments_insert_leader_member" on public.project_assignments;
create policy "project_assignments_insert_leader_member"
on public.project_assignments for insert
to authenticated
with check (
  public.is_active_leader()
  and public.profile_has_role(user_id, 'member')
);

drop policy if exists "project_assignments_update_leader_member" on public.project_assignments;
create policy "project_assignments_update_leader_member"
on public.project_assignments for update
to authenticated
using (public.is_active_leader())
with check (
  public.is_active_leader()
  and public.profile_has_role(user_id, 'member')
);

drop policy if exists "project_assignments_delete_leader" on public.project_assignments;
create policy "project_assignments_delete_leader"
on public.project_assignments for delete
to authenticated
using (public.is_active_leader());

drop policy if exists "activity_logs_select_relevant" on public.activity_logs;
create policy "activity_logs_select_relevant"
on public.activity_logs for select
to authenticated
using (
  public.is_active_leader()
  or (
    public.can_use_app()
    and (actor_id = auth.uid() or target_user_id = auth.uid())
  )
);

drop policy if exists "activity_logs_insert_actor" on public.activity_logs;
create policy "activity_logs_insert_actor"
on public.activity_logs for insert
to authenticated
with check (
  public.can_use_app()
  and actor_id = auth.uid()
  and (public.is_active_leader() or target_user_id is null)
);

drop policy if exists "review_attachments_select_self_or_leader" on storage.objects;
create policy "review_attachments_select_self_or_leader"
on storage.objects for select
to authenticated
using (
  bucket_id = 'review-attachments'
  and public.can_use_app()
  and (
    public.is_active_leader()
    or auth.uid()::text = split_part(name, '/', 1)
  )
);

drop policy if exists "review_attachments_insert_self" on storage.objects;
create policy "review_attachments_insert_self"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'review-attachments'
  and public.can_use_app()
  and auth.uid()::text = split_part(name, '/', 1)
);

drop policy if exists "review_attachments_delete_self_or_leader" on storage.objects;
create policy "review_attachments_delete_self_or_leader"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'review-attachments'
  and public.can_use_app()
  and (
    public.is_active_leader()
    or auth.uid()::text = split_part(name, '/', 1)
  )
);
