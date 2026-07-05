create table public.duty_major_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger duty_major_categories_set_updated_at
before update on public.duty_major_categories
for each row execute function public.set_updated_at();

alter table public.duties
  add column if not exists major_category_id uuid references public.duty_major_categories(id) on delete restrict,
  add column if not exists sort_order integer;

insert into public.duty_major_categories (name, sort_order)
values ('미분류', 1)
on conflict (name) do nothing;

update public.duties
set major_category_id = (
  select id from public.duty_major_categories where name = '미분류' limit 1
)
where major_category_id is null;

alter table public.duties alter column major_category_id set not null;

alter table public.duties drop constraint if exists duties_name_key;

alter table public.duties
  add constraint duties_major_category_name_key unique (major_category_id, name);

create index if not exists duties_major_category_idx on public.duties(major_category_id);
create index if not exists duty_major_categories_sort_order_idx on public.duty_major_categories(sort_order);

alter table public.duty_major_categories enable row level security;

create policy "duty_major_categories_select_assigned_or_leader"
on public.duty_major_categories for select
to authenticated
using (
  public.is_active_leader()
  or (
    public.can_use_app()
    and exists (
      select 1
        from public.duties d
        join public.duty_assignments da on da.duty_id = d.id
       where d.major_category_id = duty_major_categories.id
         and da.user_id = auth.uid()
    )
  )
);

create policy "duty_major_categories_write_leader"
on public.duty_major_categories for all
to authenticated
using (public.is_active_leader())
with check (public.is_active_leader());
