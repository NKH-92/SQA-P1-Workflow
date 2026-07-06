-- P1: product name uniqueness and atomic product/duty assignment replace RPCs.

-- 삭제 금지. 중복이 있으면 migration을 실패시킨다.
do $$
begin
  if exists (
    select 1
    from public.products
    group by name
    having count(*) > 1
  ) then
    raise exception 'duplicate products exist. resolve duplicates manually before adding products_name_key';
  end if;
end $$;

alter table public.products
  drop constraint if exists products_name_key;

alter table public.products
  add constraint products_name_key unique (name);

create or replace function public.replace_product_assignments(
  p_product_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if not exists (select 1 from public.products where id = p_product_id) then
    raise exception 'product not found';
  end if;

  delete from public.product_assignments
   where product_id = p_product_id
     and user_id <> all(coalesce(p_member_ids, array[]::uuid[]));

  if p_member_ids is not null then
    foreach v_member_id in array p_member_ids loop
      insert into public.product_assignments (product_id, user_id)
      values (p_product_id, v_member_id)
      on conflict (user_id, product_id) do nothing;
    end loop;
  end if;
end;
$$;

create or replace function public.replace_duty_assignments(
  p_duty_id uuid,
  p_member_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
begin
  if not public.is_active_leader() then
    raise exception 'permission denied';
  end if;

  if not exists (select 1 from public.duties where id = p_duty_id) then
    raise exception 'duty not found';
  end if;

  delete from public.duty_assignments
   where duty_id = p_duty_id
     and user_id <> all(coalesce(p_member_ids, array[]::uuid[]));

  if p_member_ids is not null then
    foreach v_member_id in array p_member_ids loop
      insert into public.duty_assignments (duty_id, user_id)
      values (p_duty_id, v_member_id)
      on conflict (user_id, duty_id) do nothing;
    end loop;
  end if;
end;
$$;

revoke all on function public.replace_product_assignments(uuid, uuid[]) from public;
grant execute on function public.replace_product_assignments(uuid, uuid[]) to authenticated;

revoke all on function public.replace_duty_assignments(uuid, uuid[]) from public;
grant execute on function public.replace_duty_assignments(uuid, uuid[]) to authenticated;
