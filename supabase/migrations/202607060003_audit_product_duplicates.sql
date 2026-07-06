-- Audit remaining duplicate product names after 202607060002.
-- Does not delete data; records duplicates for manual merge.

create table if not exists public.product_dedup_audit (
  id uuid primary key default gen_random_uuid(),
  checked_at timestamptz not null default now(),
  duplicate_name text not null,
  duplicate_count integer not null
);

insert into public.product_dedup_audit (duplicate_name, duplicate_count)
select name, count(*)
from public.products
group by name
having count(*) > 1;

-- Fail future applies if duplicates remain and unique constraint is missing.
do $$
begin
  if exists (
    select 1
    from public.products
    group by name
    having count(*) > 1
  ) and not exists (
    select 1
    from pg_constraint
    where conname = 'products_name_key'
      and conrelid = 'public.products'::regclass
  ) then
    raise exception 'duplicate products exist. resolve duplicates manually before adding products_name_key';
  end if;
end $$;

alter table public.products
  drop constraint if exists products_name_key;

alter table public.products
  add constraint products_name_key unique (name);
