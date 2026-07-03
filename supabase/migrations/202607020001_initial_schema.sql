create extension if not exists "pgcrypto";
create extension if not exists "citext";

create type public.app_role as enum ('leader', 'member');
create type public.review_status as enum ('pending', 'in_review', 'approved', 'rejected');
create type public.project_status as enum ('planned', 'in_progress', 'done');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null unique,
  name text not null,
  role public.app_role not null default 'member',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.allowed_users (
  id uuid primary key default gen_random_uuid(),
  email citext not null unique,
  name text not null,
  role public.app_role not null default 'member',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.profile_notes (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  leader_id uuid not null references public.profiles(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.product_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, product_id)
);

create table public.duties (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.duty_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  duty_id uuid not null references public.duties(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, duty_id)
);

create table public.review_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  attachment_url text,
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.review_feedback (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null references public.review_requests(id) on delete cascade,
  leader_id uuid not null references public.profiles(id) on delete restrict,
  comment text not null,
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  deadline date,
  status public.project_status not null default 'planned',
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, user_id)
);

create index product_assignments_user_idx on public.product_assignments(user_id);
create index product_assignments_product_idx on public.product_assignments(product_id);
create index profile_notes_profile_idx on public.profile_notes(profile_id);
create index duty_assignments_user_idx on public.duty_assignments(user_id);
create index review_requests_requester_idx on public.review_requests(requester_id);
create index review_requests_status_idx on public.review_requests(status);
create index review_feedback_request_idx on public.review_feedback(review_request_id);
create index project_assignments_user_idx on public.project_assignments(user_id);
create index project_assignments_project_idx on public.project_assignments(project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

create trigger product_assignments_set_updated_at
before update on public.product_assignments
for each row execute function public.set_updated_at();

create trigger duties_set_updated_at
before update on public.duties
for each row execute function public.set_updated_at();

create trigger review_requests_set_updated_at
before update on public.review_requests
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

create trigger project_assignments_set_updated_at
before update on public.project_assignments
for each row execute function public.set_updated_at();

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_leader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_user_role() = 'leader', false);
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invite public.allowed_users%rowtype;
begin
  select *
    into invite
    from public.allowed_users
   where lower(email::text) = lower(new.email::text)
   limit 1;

  if invite.id is not null then
    insert into public.profiles (id, email, name, role)
    values (new.id, new.email, invite.name, invite.role)
    on conflict (id) do update
      set email = excluded.email,
          name = excluded.name,
          role = excluded.role;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.handle_allowed_user_saved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, name, role)
  select auth_user.id, auth_user.email, new.name, new.role
    from auth.users auth_user
   where lower(auth_user.email::text) = lower(new.email::text)
   limit 1
  on conflict (id) do update
    set email = excluded.email,
        name = excluded.name,
        role = excluded.role;

  return new;
end;
$$;

drop trigger if exists on_allowed_user_saved on public.allowed_users;
create trigger on_allowed_user_saved
after insert or update of email, name, role on public.allowed_users
for each row execute function public.handle_allowed_user_saved();

alter table public.profiles enable row level security;
alter table public.allowed_users enable row level security;
alter table public.profile_notes enable row level security;
alter table public.products enable row level security;
alter table public.product_assignments enable row level security;
alter table public.duties enable row level security;
alter table public.duty_assignments enable row level security;
alter table public.review_requests enable row level security;
alter table public.review_feedback enable row level security;
alter table public.projects enable row level security;
alter table public.project_assignments enable row level security;

create policy "profiles_select_self_or_leader"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_leader());

create policy "profiles_update_leader"
on public.profiles for update
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "allowed_users_leader_all"
on public.allowed_users for all
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "profile_notes_select_self_or_leader"
on public.profile_notes for select
to authenticated
using (profile_id = auth.uid() or public.is_leader());

create policy "profile_notes_write_leader"
on public.profile_notes for all
to authenticated
using (public.is_leader())
with check (public.is_leader() and leader_id = auth.uid());

create policy "products_select_assigned_or_leader"
on public.products for select
to authenticated
using (
  public.is_leader()
  or exists (
    select 1
      from public.product_assignments pa
     where pa.product_id = products.id
       and pa.user_id = auth.uid()
  )
);

create policy "products_write_leader"
on public.products for all
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "product_assignments_select_self_or_leader"
on public.product_assignments for select
to authenticated
using (user_id = auth.uid() or public.is_leader());

create policy "product_assignments_write_leader"
on public.product_assignments for all
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "duties_select_assigned_or_leader"
on public.duties for select
to authenticated
using (
  public.is_leader()
  or exists (
    select 1
      from public.duty_assignments da
     where da.duty_id = duties.id
       and da.user_id = auth.uid()
  )
);

create policy "duties_write_leader"
on public.duties for all
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "duty_assignments_select_self_or_leader"
on public.duty_assignments for select
to authenticated
using (user_id = auth.uid() or public.is_leader());

create policy "duty_assignments_write_leader"
on public.duty_assignments for all
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "review_requests_select_self_or_leader"
on public.review_requests for select
to authenticated
using (requester_id = auth.uid() or public.is_leader());

create policy "review_requests_insert_self_pending"
on public.review_requests for insert
to authenticated
with check (requester_id = auth.uid() and status = 'pending');

create policy "review_requests_update_leader"
on public.review_requests for update
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "review_requests_delete_leader"
on public.review_requests for delete
to authenticated
using (public.is_leader());

create policy "review_feedback_select_requester_or_leader"
on public.review_feedback for select
to authenticated
using (
  public.is_leader()
  or exists (
    select 1
      from public.review_requests rr
     where rr.id = review_feedback.review_request_id
       and rr.requester_id = auth.uid()
  )
);

create policy "review_feedback_insert_leader"
on public.review_feedback for insert
to authenticated
with check (public.is_leader() and leader_id = auth.uid());

create policy "review_feedback_update_leader"
on public.review_feedback for update
to authenticated
using (public.is_leader())
with check (public.is_leader());

create policy "review_feedback_delete_leader"
on public.review_feedback for delete
to authenticated
using (public.is_leader());

create policy "projects_select_assigned_or_leader"
on public.projects for select
to authenticated
using (
  public.is_leader()
  or exists (
    select 1
      from public.project_assignments pa
     where pa.project_id = projects.id
       and pa.user_id = auth.uid()
  )
);

create policy "projects_write#!/bin/sh

# An example hook script to update a checked-out tree on a git push.
#
# This hook is invoked by git-receive-pack(1) when it reacts to git
# push and updates reference(s) in its repository, and when the push
# tries to update the branch that is currently checked out and the
# receive.denyCurrentBranch configuration variable is set to
# updateInstead.
#
# By default, such a push is refused if the working tree and the index
# of the r