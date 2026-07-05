alter table public.profiles
  add column if not exists is_active boolean not null default true;

create or replace function public.is_active_self()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_active from public.profiles where id = auth.uid()),
    false
  );
$$;

create or replace function public.can_use_app()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_leader() or public.is_active_self();
$$;

drop policy if exists "profiles_update_leader" on public.profiles;
create policy "profiles_update_leader"
on public.profiles for update
to authenticated
using (public.is_leader())
with check (public.is_leader());

drop policy if exists "review_requests_insert_self_pending" on public.review_requests;
create policy "review_requests_insert_self_pending"
on public.review_requests for insert
to authenticated
with check (
  public.can_use_app()
  and requester_id = auth.uid()
  and status = 'pending'
);

drop policy if exists "review_requests_update_self_pending" on public.review_requests;
create policy "review_requests_update_self_pending"
on public.review_requests for update
to authenticated
using (public.can_use_app() and requester_id = auth.uid() and status = 'pending')
with check (public.can_use_app() and requester_id = auth.uid() and status = 'pending');

drop policy if exists "review_requests_delete_self_pending" on public.review_requests;
create policy "review_requests_delete_self_pending"
on public.review_requests for delete
to authenticated
using (public.can_use_app() and requester_id = auth.uid() and status = 'pending');

drop policy if exists "product_assignments_select_self_or_leader" on public.product_assignments;
create policy "product_assignments_select_self_or_leader"
on public.product_assignments for select
to authenticated
using (public.can_use_app() and (user_id = auth.uid() or public.is_leader()));

drop policy if exists "duty_assignments_select_self_or_leader" on public.duty_assignments;
create policy "duty_assignments_select_self_or_leader"
on public.duty_assignments for select
to authenticated
using (public.can_use_app() and (user_id = auth.uid() or public.is_leader()));

drop policy if exists "project_assignments_select_self_or_leader" on public.project_assignments;
create policy "project_assignments_select_self_or_leader"
on public.project_assignments for select
to authenticated
using (public.can_use_app() and (user_id = auth.uid() or public.is_leader()));

drop policy if exists "review_requests_select_self_or_leader" on public.review_requests;
create policy "review_requests_select_self_or_leader"
on public.review_requests for select
to authenticated
using (public.can_use_app() and (requester_id = auth.uid() or public.is_leader()));
