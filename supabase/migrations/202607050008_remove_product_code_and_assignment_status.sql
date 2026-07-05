alter table public.products
  drop column if exists code;

alter table public.product_assignments
  drop column if exists status;
