alter table public.products
add column if not exists category text not null default '자사',
add column if not exists company_name text not null default '자사',
add column if not exists sort_order integer;

do $$
begin
  if not exists (
    select 1
      from pg_constraint
     where conname = 'products_category_check'
       and conrelid = 'public.products'::regclass
  ) then
    alter table public.products
    add constraint products_category_check
    check (category in ('자사', '위탁')) not valid;
  end if;
end $$;

alter table public.products validate constraint products_category_check;

create index if not exists products_sort_order_idx on public.products(sort_order);
