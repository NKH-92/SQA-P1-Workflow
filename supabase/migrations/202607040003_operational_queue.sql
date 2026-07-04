alter table public.review_requests
add column if not exists due_date date;

create index if not exists review_requests_due_date_idx
on public.review_requests(due_date)
where due_date is not null;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references public.profiles(id) on delete cascade,
  target_user_id uuid references public.profiles(id) on delete set null,
  entity_type text not null check (
    entity_type in (
      'review_request',
      'review_feedback',
      'project',
      'project_assignment',
      'product_assignment',
      'duty_assignment',
      'allowed_user',
      'profile_note'
    )
  ),
  entity_id uuid,
  action text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists activity_logs_actor_idx
on public.activity_logs(actor_id, created_at desc);

create index if not exists activity_logs_target_idx
on public.activity_logs(target_user_id, created_at desc);

create index if not exists activity_logs_entity_idx
on public.activity_logs(entity_type, entity_id, created_at desc);

alter table public.activity_logs enable row level security;

drop policy if exists "activity_logs_select_relevant" on public.activity_logs;
create policy "activity_logs_select_relevant"
on public.activity_logs for select
to authenticated
using (
  public.is_leader()
  or actor_id = auth.uid()
  or target_user_id = auth.uid()
);

drop policy if exists "activity_logs_insert_actor" on public.activity_logs;
create policy "activity_logs_insert_actor"
on public.activity_logs for insert
to authenticated
with check (
  actor_id = auth.uid()
  and (
    public.is_leader()
    or target_user_id is null
  )
);
