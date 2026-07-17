-- Product-level execution tracking for change-control actions.
-- Common change information is stored once; product tasks retain their own
-- assignee, status, completion evidence, and immutable audit history.

create type public.change_application_source as enum ('official', 'internal', 'other');
create type public.change_application_status as enum ('draft', 'published', 'cancelled');
create type public.change_action_kind as enum ('product_standard', 'other');
create type public.product_change_task_status as enum ('pending', 'completed', 'not_applicable', 'cancelled');

create sequence public.internal_change_number_seq;

create table public.change_applications (
  id uuid primary key default gen_random_uuid(),
  change_number citext not null unique,
  source public.change_application_source not null,
  title text not null,
  summary text not null,
  source_url text,
  effective_date date,
  status public.change_application_status not null default 'draft',
  content_locked_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  published_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_applications_number_length_check
    check (char_length(change_number::text) between 1 and 100),
  constraint change_applications_title_length_check
    check (char_length(title) between 1 and 200),
  constraint change_applications_summary_length_check
    check (char_length(summary) between 1 and 5000),
  constraint change_applications_source_url_length_check
    check (source_url is null or char_length(source_url) <= 2000),
  constraint change_applications_source_url_scheme_check
    check (source_url is null or source_url ~* '^https?://'),
  constraint change_applications_cancel_state_check
    check (
      (status = 'cancelled' and cancelled_at is not null and cancellation_reason is not null)
      or (status <> 'cancelled' and cancelled_at is null and cancellation_reason is null)
    )
);

create table public.change_action_items (
  id uuid primary key default gen_random_uuid(),
  change_application_id uuid not null
    references public.change_applications(id) on delete cascade,
  kind public.change_action_kind not null,
  custom_kind_name text,
  content text not null,
  due_date date not null,
  sort_order integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint change_action_items_content_length_check
    check (char_length(content) between 1 and 5000),
  constraint change_action_items_custom_kind_check
    check (
      (kind = 'other' and custom_kind_name is not null and char_length(custom_kind_name) between 1 and 100)
      or (kind = 'product_standard' and custom_kind_name is null)
    ),
  constraint change_action_items_application_order_key
    unique (change_application_id, sort_order)
);

create table public.product_change_tasks (
  id uuid primary key default gen_random_uuid(),
  action_item_id uuid not null references public.change_action_items(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  product_name text not null,
  assignee_id uuid references public.profiles(id) on delete set null,
  assignee_name text,
  status public.product_change_task_status not null default 'pending',
  product_note text,
  completion_note text,
  resolution_reason text,
  proxy_reason text,
  completed_by uuid references public.profiles(id) on delete set null,
  completed_by_name text,
  completed_at timestamptz,
  reopened_by uuid references public.profiles(id) on delete set null,
  reopened_by_name text,
  reopened_at timestamptz,
  reopen_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_change_tasks_action_product_key unique (action_item_id, product_id),
  constraint product_change_tasks_product_note_length_check
    check (product_note is null or char_length(product_note) <= 2000),
  constraint product_change_tasks_completion_note_length_check
    check (completion_note is null or char_length(completion_note) <= 2000),
  constraint product_change_tasks_resolution_reason_length_check
    check (resolution_reason is null or char_length(resolution_reason) <= 2000),
  constraint product_change_tasks_proxy_reason_length_check
    check (proxy_reason is null or char_length(proxy_reason) <= 2000),
  constraint product_change_tasks_completion_state_check
    check (
      (status in ('completed', 'not_applicable') and completed_by is not null and completed_at is not null)
      or (status in ('pending', 'cancelled') and completed_by is null and completed_at is null)
    ),
  constraint product_change_tasks_not_applicable_reason_check
    check (status <> 'not_applicable' or resolution_reason is not null)
);

create index change_applications_status_created_idx
  on public.change_applications(status, created_at desc);
create index change_applications_created_by_idx
  on public.change_applications(created_by, created_at desc);
create index change_action_items_application_idx
  on public.change_action_items(change_application_id, sort_order);
create index product_change_tasks_assignee_status_idx
  on public.product_change_tasks(assignee_id, status, updated_at desc);
create index product_change_tasks_product_idx
  on public.product_change_tasks(product_id, updated_at desc);
create index product_change_tasks_action_status_idx
  on public.product_change_tasks(action_item_id, status);

create trigger change_applications_set_updated_at
before update on public.change_applications
for each row execute function public.set_updated_at();

create trigger change_action_items_set_updated_at
before update on public.change_action_items
for each row execute function public.set_updated_at();

create trigger product_change_tasks_set_updated_at
before update on public.product_change_tasks
for each row execute function public.set_updated_at();

alter table public.activity_logs
drop constraint if exists activity_logs_entity_type_check;

alter table public.activity_logs
add constraint activity_logs_entity_type_check
check (
  entity_type in (
    'review_request', 'review_feedback', 'project', 'project_assignment',
    'product_assignment', 'duty_assignment', 'allowed_user', 'profile_note',
    'product', 'duty', 'duty_major_category', 'announcement', 'change_application',
    'change_action_item', 'product_change_task'
  )
);

alter table public.change_applications enable row level security;
alter table public.change_action_items enable row level security;
alter table public.product_change_tasks enable row level security;

revoke all on table public.change_applications from public, anon, authenticated;
revoke all on table public.change_action_items from public, anon, authenticated;
revoke all on table public.product_change_tasks from public, anon, authenticated;
revoke all on sequence public.internal_change_number_seq from public, anon, authenticated;

grant select on table public.change_applications to authenticated;
grant select on table public.change_action_items to authenticated;
grant select on table public.product_change_tasks to authenticated;
grant all on table public.change_applications to service_role;
grant all on table public.change_action_items to service_role;
grant all on table public.product_change_tasks to service_role;
grant all on sequence public.internal_change_number_seq to service_role;

create policy "change_applications_select_app_user"
on public.change_applications for select
to authenticated
using (
  (select public.can_use_app())
  and (
    created_by = (select auth.uid())
    or (select public.is_active_leader())
    or (
      published_at is not null
      and status in ('published', 'cancelled')
    )
  )
);

create policy "change_action_items_select_app_user"
on public.change_action_items for select
to authenticated
using (
  (select public.can_use_app())
  and exists (
    select 1
      from public.change_applications application
     where application.id = change_action_items.change_application_id
       and (
          application.created_by = (select auth.uid())
          or (select public.is_active_leader())
          or (
            application.published_at is not null
            and application.status in ('published', 'cancelled')
          )
       )
  )
);

create policy "product_change_tasks_select_relevant"
on public.product_change_tasks for select
to authenticated
using (
  (select public.can_use_app())
  and (
    (select public.is_active_leader())
    or exists (
      select 1
        from public.change_action_items action_item
        join public.change_applications application
          on application.id = action_item.change_application_id
       where action_item.id = product_change_tasks.action_item_id
         and (
           application.created_by = (select auth.uid())
           or (
              application.published_at is not null
              and application.status in ('published', 'cancelled')
              and product_change_tasks.assignee_id = (select auth.uid())
           )
         )
    )
  )
);

-- Limited directories let every active user build a registration preview without
-- exposing profile emails or broadening the existing team-management RLS policies.
create or replace function public.list_change_application_product_scope()
returns table (
  product_id uuid,
  product_name text,
  category text,
  company_name text,
  sort_order integer,
  assignee_id uuid,
  assignee_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_use_app() then
    raise exception 'permission denied';
  end if;

  return query
  select
    product.id,
    product.name,
    product.category,
    product.company_name,
    product.sort_order,
    case when profile.id is not null then assignment.user_id else null end,
    case when profile.is_active then profile.name else null end
  from public.products product
  left join public.product_assignments assignment
    on assignment.product_id = product.id
  left join public.profiles profile
    on profile.id = assignment.user_id
   and profile.is_active
  order by product.sort_order nulls last, product.name, profile.name;
end;
$$;

create or replace function public.list_change_application_assignees()
returns table (id uuid, name text, role public.app_role)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.can_use_app() then
    raise exception 'permission denied';
  end if;

  return query
  select profile.id, profile.name, profile.role
    from public.profiles profile
   where profile.is_active
   order by profile.role, profile.name;
end;
$$;

revoke all on function public.list_change_application_product_scope() from public, anon;
revoke all on function public.list_change_application_assignees() from public, anon;
grant execute on function public.list_change_application_product_scope() to authenticated;
grant execute on function public.list_change_application_assignees() to authenticated;

create or replace function private.persist_change_application(
  p_change_application_id uuid,
  p_expected_updated_at timestamptz,
  p_change_number text,
  p_source public.change_application_source,
  p_title text,
  p_summary text,
  p_source_url text,
  p_effective_date date,
  p_action_kind public.change_action_kind,
  p_custom_kind_name text,
  p_action_content text,
  p_due_date date,
  p_tasks jsonb,
  p_publish boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_application public.change_applications%rowtype;
  v_application_id uuid;
  v_action_item_id uuid;
  v_change_number text := upper(btrim(coalesce(p_change_number, '')));
  v_title text := btrim(coalesce(p_title, ''));
  v_summary text := btrim(coalesce(p_summary, ''));
  v_source_url text := nullif(btrim(coalesce(p_source_url, '')), '');
  v_custom_kind_name text := nullif(btrim(coalesce(p_custom_kind_name, '')), '');
  v_action_content text := btrim(coalesce(p_action_content, ''));
  v_scope record;
  v_product_name text;
  v_assignee_name text;
  v_existing_task_id uuid;
  v_existing_task_status public.product_change_task_status;
  v_task_count integer;
  v_unique_task_count integer;
  v_was_new boolean := false;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() then raise exception 'permission denied'; end if;
  if p_change_application_id is null and p_expected_updated_at is not null then
    raise exception 'change application was modified by another user';
  end if;
  if p_source is null then raise exception 'change source is required'; end if;
  if char_length(v_title) not between 1 and 200 then raise exception 'title is invalid'; end if;
  if char_length(v_summary) not between 1 and 5000 then raise exception 'summary is invalid'; end if;
  if v_source_url is not null and (
    char_length(v_source_url) > 2000
    or v_source_url !~* '^https?://'
  ) then
    raise exception 'source url must use http or https';
  end if;
  if p_effective_date is null then raise exception 'effective date is required'; end if;
  if p_action_kind is null then raise exception 'action kind is required'; end if;
  if char_length(v_action_content) not between 1 and 5000 then raise exception 'action content is invalid'; end if;
  if p_due_date is null then raise exception 'due date is required'; end if;
  if p_action_kind = 'other' and (v_custom_kind_name is null or char_length(v_custom_kind_name) > 100) then
    raise exception 'custom kind name is required';
  end if;
  if p_action_kind = 'product_standard' then v_custom_kind_name := null; end if;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 then
    raise exception 'at least one product task is required';
  end if;

  select count(*), count(distinct value ->> 'product_id')
    into v_task_count, v_unique_task_count
    from jsonb_array_elements(p_tasks);
  if v_task_count <> v_unique_task_count then
    raise exception 'duplicate product task';
  end if;

  if v_change_number = '' then
    if p_source = 'official' then
      raise exception 'official change number is required';
    end if;
    v_change_number :=
      case when p_source = 'internal' then 'INT-' else 'ETC-' end
      || to_char(current_date, 'YYYY') || '-'
      || lpad(nextval('public.internal_change_number_seq'::regclass)::text, 4, '0');
  end if;
  if char_length(v_change_number) > 100 then raise exception 'change number is invalid'; end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;

  if p_change_application_id is null then
    v_was_new := true;
    insert into public.change_applications (
      change_number, source, title, summary, source_url, effective_date,
      status, created_by, published_at
    ) values (
      v_change_number, p_source, v_title, v_summary, v_source_url, p_effective_date,
      case when p_publish then 'published'::public.change_application_status
           else 'draft'::public.change_application_status end,
      v_actor_id,
      case when p_publish then now() else null end
    )
    returning * into v_application;
  else
    select * into v_application
      from public.change_applications
     where id = p_change_application_id
     for update;
    if not found then raise exception 'change application not found'; end if;
    if v_application.status = 'cancelled' then raise exception 'cancelled change application cannot be edited'; end if;
    if v_application.created_by <> v_actor_id and not public.is_active_leader() then
      raise exception 'permission denied';
    end if;
    if p_expected_updated_at is null
      or v_application.updated_at is distinct from p_expected_updated_at
    then
      raise exception 'change application was modified by another user';
    end if;
    if v_application.status = 'published' and not p_publish then
      raise exception 'published change application cannot return to draft';
    end if;
    if v_application.content_locked_at is not null then
      raise exception 'change application is locked after the first processed task';
    end if;
    if exists (
      select 1
        from public.change_action_items existing_action
        join public.product_change_tasks existing_task
          on existing_task.action_item_id = existing_action.id
       where existing_action.change_application_id = v_application.id
         and existing_task.status = 'cancelled'
    ) then
      raise exception 'cancelled product change task cannot be reactivated';
    end if;

    update public.change_applications
       set change_number = v_change_number,
           source = p_source,
           title = v_title,
           summary = v_summary,
           source_url = v_source_url,
           effective_date = p_effective_date,
           status = case when p_publish then 'published'::public.change_application_status
                         else 'draft'::public.change_application_status end,
           published_at = case when p_publish then coalesce(v_application.published_at, now()) else null end
     where id = v_application.id
     returning * into v_application;
  end if;
  v_application_id := v_application.id;

  select id into v_action_item_id
    from public.change_action_items
   where change_application_id = v_application_id
   order by sort_order
   limit 1
   for update;

  if v_action_item_id is null then
    insert into public.change_action_items (
      change_application_id, kind, custom_kind_name, content, due_date, sort_order
    ) values (
      v_application_id, p_action_kind, v_custom_kind_name, v_action_content, p_due_date, 1
    ) returning id into v_action_item_id;
  else
    update public.change_action_items
       set kind = p_action_kind,
           custom_kind_name = v_custom_kind_name,
           content = v_action_content,
           due_date = p_due_date
     where id = v_action_item_id;
  end if;

  update public.product_change_tasks task
     set status = 'cancelled',
         resolution_reason = '제품 적용 범위에서 제외됨',
         proxy_reason = null,
         completed_by = null,
         completed_by_name = null,
         completed_at = null
   where task.action_item_id = v_action_item_id
     and task.status = 'pending'
     and not exists (
       select 1
         from jsonb_array_elements(p_tasks) scope
        where (scope ->> 'product_id')::uuid = task.product_id
     );

  for v_scope in
    select
      (scope ->> 'product_id')::uuid as product_id,
      nullif(scope ->> 'assignee_id', '')::uuid as assignee_id,
      nullif(btrim(coalesce(scope ->> 'product_note', '')), '') as product_note
      from jsonb_array_elements(p_tasks) scope
  loop
    select product.name into v_product_name
      from public.products product
     where product.id = v_scope.product_id;
    if not found then raise exception 'product not found'; end if;

    v_assignee_name := null;
    if v_scope.assignee_id is not null then
      select profile.name into v_assignee_name
        from public.profiles profile
       where profile.id = v_scope.assignee_id
         and profile.is_active;
      if not found then raise exception 'assignee must be an active profile'; end if;
      if exists (
        select 1
          from public.product_assignments current_assignment
          join public.profiles current_profile on current_profile.id = current_assignment.user_id
         where current_assignment.product_id = v_scope.product_id
           and current_profile.is_active
      ) and not exists (
        select 1
          from public.product_assignments selected_assignment
          join public.profiles selected_profile on selected_profile.id = selected_assignment.user_id
         where selected_assignment.product_id = v_scope.product_id
           and selected_assignment.user_id = v_scope.assignee_id
           and selected_profile.is_active
      ) then
        raise exception 'assignee must be a current product assignee';
      end if;
    end if;

    select task.id, task.status into v_existing_task_id, v_existing_task_status
      from public.product_change_tasks task
     where task.action_item_id = v_action_item_id
       and task.product_id = v_scope.product_id
     for update;

    if v_existing_task_id is null then
      insert into public.product_change_tasks (
        action_item_id, product_id, product_name, assignee_id, assignee_name, product_note
      ) values (
        v_action_item_id, v_scope.product_id, v_product_name,
        v_scope.assignee_id, v_assignee_name, v_scope.product_note
      );
    else
      if v_existing_task_status = 'cancelled' then
        raise exception 'cancelled product change task cannot be reactivated';
      end if;
      update public.product_change_tasks
         set product_name = v_product_name,
             assignee_id = v_scope.assignee_id,
             assignee_name = v_assignee_name,
             product_note = v_scope.product_note,
             status = 'pending',
             resolution_reason = null,
             proxy_reason = null,
             completed_by = null,
             completed_by_name = null,
             completed_at = null
       where id = v_existing_task_id;
    end if;
    v_existing_task_id := null;
    v_existing_task_status := null;
  end loop;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id,
    null,
    'change_application',
    v_application_id,
    case
      when v_was_new and p_publish then 'published'
      when v_was_new then 'draft_saved'
      when p_publish then 'updated'
      else 'draft_saved'
    end,
    coalesce(v_actor_name, '사용자') || '님이 ' || v_change_number || ' 변경 적용업무를 '
      || case when p_publish then '등록했습니다.' else '초안으로 저장했습니다.' end,
    jsonb_build_object('status', case when p_publish then 'published' else 'draft' end, 'task_count', v_task_count)
  );

  return v_application_id;
end;
$$;

revoke all on function private.persist_change_application(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb, boolean
) from public, anon, authenticated;

create or replace function public.save_change_application_draft(
  p_change_application_id uuid,
  p_expected_updated_at timestamptz,
  p_change_number text,
  p_source public.change_application_source,
  p_title text,
  p_summary text,
  p_source_url text,
  p_effective_date date,
  p_action_kind public.change_action_kind,
  p_custom_kind_name text,
  p_action_content text,
  p_due_date date,
  p_tasks jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.persist_change_application(
    p_change_application_id, p_expected_updated_at, p_change_number, p_source, p_title, p_summary,
    p_source_url, p_effective_date, p_action_kind, p_custom_kind_name,
    p_action_content, p_due_date, p_tasks, false
  );
$$;

create or replace function public.publish_change_application(
  p_change_application_id uuid,
  p_expected_updated_at timestamptz,
  p_change_number text,
  p_source public.change_application_source,
  p_title text,
  p_summary text,
  p_source_url text,
  p_effective_date date,
  p_action_kind public.change_action_kind,
  p_custom_kind_name text,
  p_action_content text,
  p_due_date date,
  p_tasks jsonb
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select private.persist_change_application(
    p_change_application_id, p_expected_updated_at, p_change_number, p_source, p_title, p_summary,
    p_source_url, p_effective_date, p_action_kind, p_custom_kind_name,
    p_action_content, p_due_date, p_tasks, true
  );
$$;

revoke all on function public.save_change_application_draft(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) from public, anon;
revoke all on function public.publish_change_application(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) from public, anon;
grant execute on function public.save_change_application_draft(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) to authenticated;
grant execute on function public.publish_change_application(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) to authenticated;

create or replace function public.complete_product_change_task(
  p_task_id uuid,
  p_completion_note text,
  p_proxy_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_application_id uuid;
  v_status public.product_change_task_status;
  v_application_status public.change_application_status;
  v_assignee_id uuid;
  v_product_name text;
  v_change_title text;
  v_completion_note text := nullif(btrim(coalesce(p_completion_note, '')), '');
  v_proxy_reason text := nullif(btrim(coalesce(p_proxy_reason, '')), '');
  v_is_leader boolean;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() then raise exception 'permission denied'; end if;
  if v_completion_note is not null and char_length(v_completion_note) > 2000 then raise exception 'completion note is invalid'; end if;
  if v_proxy_reason is not null and char_length(v_proxy_reason) > 2000 then raise exception 'proxy reason is invalid'; end if;

  select application.id, task.status, task.assignee_id, task.product_name, application.title, application.status
    into v_application_id, v_status, v_assignee_id, v_product_name, v_change_title, v_application_status
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join public.change_applications application on application.id = action_item.change_application_id
   where task.id = p_task_id
   for update of task;
  if not found then raise exception 'product change task not found'; end if;
  if v_application_status <> 'published' then raise exception 'change application is not published'; end if;
  if v_status <> 'pending' then raise exception 'product change task is not pending'; end if;

  v_is_leader := public.is_active_leader();
  if v_assignee_id is distinct from v_actor_id and not v_is_leader then raise exception 'permission denied'; end if;
  if v_assignee_id is distinct from v_actor_id and v_proxy_reason is null then
    raise exception 'proxy reason is required';
  end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;

  update public.product_change_tasks
     set status = 'completed',
         completion_note = v_completion_note,
         resolution_reason = null,
         proxy_reason = v_proxy_reason,
         completed_by = v_actor_id,
         completed_by_name = v_actor_name,
         completed_at = now()
   where id = p_task_id;

  update public.change_applications
     set content_locked_at = coalesce(content_locked_at, now())
   where id = v_application_id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, v_assignee_id, 'product_change_task', p_task_id, 'completed',
    coalesce(v_actor_name, '사용자') || '님이 ' || v_product_name || ' 변경 적용을 완료했습니다.',
    jsonb_build_object('change_title', v_change_title, 'completion_note', v_completion_note, 'proxy_reason', v_proxy_reason)
  );
end;
$$;

create or replace function public.mark_product_change_task_not_applicable(
  p_task_id uuid,
  p_reason text,
  p_proxy_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_application_id uuid;
  v_status public.product_change_task_status;
  v_application_status public.change_application_status;
  v_assignee_id uuid;
  v_product_name text;
  v_change_title text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_proxy_reason text := nullif(btrim(coalesce(p_proxy_reason, '')), '');
  v_is_leader boolean;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() then raise exception 'permission denied'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'not applicable reason is required'; end if;
  if v_proxy_reason is not null and char_length(v_proxy_reason) > 2000 then raise exception 'proxy reason is invalid'; end if;

  select application.id, task.status, task.assignee_id, task.product_name, application.title, application.status
    into v_application_id, v_status, v_assignee_id, v_product_name, v_change_title, v_application_status
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join public.change_applications application on application.id = action_item.change_application_id
   where task.id = p_task_id
   for update of task;
  if not found then raise exception 'product change task not found'; end if;
  if v_application_status <> 'published' then raise exception 'change application is not published'; end if;
  if v_status <> 'pending' then raise exception 'product change task is not pending'; end if;

  v_is_leader := public.is_active_leader();
  if v_assignee_id is distinct from v_actor_id and not v_is_leader then raise exception 'permission denied'; end if;
  if v_assignee_id is distinct from v_actor_id and v_proxy_reason is null then
    raise exception 'proxy reason is required';
  end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;

  update public.product_change_tasks
     set status = 'not_applicable',
         completion_note = null,
         resolution_reason = v_reason,
         proxy_reason = v_proxy_reason,
         completed_by = v_actor_id,
         completed_by_name = v_actor_name,
         completed_at = now()
   where id = p_task_id;

  update public.change_applications
     set content_locked_at = coalesce(content_locked_at, now())
   where id = v_application_id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, v_assignee_id, 'product_change_task', p_task_id, 'not_applicable',
    coalesce(v_actor_name, '사용자') || '님이 ' || v_product_name || ' 변경 적용을 해당 없음으로 처리했습니다.',
    jsonb_build_object('change_title', v_change_title, 'reason', v_reason, 'proxy_reason', v_proxy_reason)
  );
end;
$$;

create or replace function public.reopen_product_change_task(
  p_task_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_status public.product_change_task_status;
  v_application_status public.change_application_status;
  v_assignee_id uuid;
  v_completed_by uuid;
  v_completed_at timestamptz;
  v_completion_note text;
  v_resolution_reason text;
  v_product_name text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() then raise exception 'permission denied'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'reopen reason is required'; end if;

  select
    task.status, task.assignee_id, task.completed_by, task.completed_at,
    task.completion_note, task.resolution_reason, task.product_name, application.status
    into
    v_status, v_assignee_id, v_completed_by, v_completed_at,
    v_completion_note, v_resolution_reason, v_product_name, v_application_status
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join public.change_applications application on application.id = action_item.change_application_id
   where task.id = p_task_id
   for update of task;
  if not found then raise exception 'product change task not found'; end if;
  if v_application_status <> 'published' then raise exception 'change application is not published'; end if;
  if v_status not in ('completed', 'not_applicable') then raise exception 'product change task cannot be reopened'; end if;
  if v_completed_by is distinct from v_actor_id and not public.is_active_leader() then raise exception 'permission denied'; end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;

  update public.product_change_tasks
     set status = 'pending',
         completion_note = null,
         resolution_reason = null,
         proxy_reason = null,
         completed_by = null,
         completed_by_name = null,
         completed_at = null,
         reopened_by = v_actor_id,
         reopened_by_name = v_actor_name,
         reopened_at = now(),
         reopen_reason = v_reason
   where id = p_task_id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, v_assignee_id, 'product_change_task', p_task_id, 'reopened',
    coalesce(v_actor_name, '사용자') || '님이 ' || v_product_name || ' 변경 적용업무를 다시 열었습니다.',
    jsonb_build_object(
      'previous_status', v_status,
      'previous_completed_at', v_completed_at,
      'previous_completion_note', v_completion_note,
      'previous_resolution_reason', v_resolution_reason,
      'reason', v_reason
    )
  );
end;
$$;

create or replace function public.reassign_product_change_tasks(
  p_task_ids uuid[],
  p_assignee_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_assignee_name text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_task_id uuid;
  v_status public.product_change_task_status;
  v_application_status public.change_application_status;
  v_old_assignee_id uuid;
  v_product_name text;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.is_active_leader() then raise exception 'permission denied'; end if;
  if p_task_ids is null or cardinality(p_task_ids) = 0 then raise exception 'task ids are required'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'reassignment reason is required'; end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;
  if p_assignee_id is not null then
    select name into v_assignee_name
      from public.profiles
     where id = p_assignee_id and is_active;
    if not found then raise exception 'assignee must be an active profile'; end if;
  end if;

  for v_task_id in
    select distinct candidate.task_id
      from unnest(p_task_ids) as candidate(task_id)
  loop
    select task.status, task.assignee_id, task.product_name, application.status
      into v_status, v_old_assignee_id, v_product_name, v_application_status
      from public.product_change_tasks task
      join public.change_action_items action_item on action_item.id = task.action_item_id
      join public.change_applications application on application.id = action_item.change_application_id
     where task.id = v_task_id
     for update of task;
    if not found then raise exception 'product change task not found'; end if;
    if v_application_status = 'cancelled' or v_status <> 'pending' then
      raise exception 'only pending product change tasks can be reassigned';
    end if;

    update public.product_change_tasks
       set assignee_id = p_assignee_id,
           assignee_name = v_assignee_name
     where id = v_task_id;

    insert into public.activity_logs (
      actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
    ) values (
      v_actor_id, p_assignee_id, 'product_change_task', v_task_id, 'reassigned',
      coalesce(v_actor_name, '파트장') || '님이 ' || v_product_name || ' 변경 적용 담당자를 변경했습니다.',
      jsonb_build_object('from_assignee_id', v_old_assignee_id, 'to_assignee_id', p_assignee_id, 'reason', v_reason)
    );
  end loop;
end;
$$;

create or replace function public.cancel_product_change_task(
  p_task_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_status public.product_change_task_status;
  v_creator_id uuid;
  v_assignee_id uuid;
  v_product_name text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() then raise exception 'permission denied'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'cancellation reason is required'; end if;

  select task.status, application.created_by, task.assignee_id, task.product_name
    into v_status, v_creator_id, v_assignee_id, v_product_name
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join public.change_applications application on application.id = action_item.change_application_id
   where task.id = p_task_id
   for update of task;
  if not found then raise exception 'product change task not found'; end if;
  if v_creator_id <> v_actor_id and not public.is_active_leader() then raise exception 'permission denied'; end if;
  if v_status <> 'pending' then raise exception 'only pending product change tasks can be cancelled'; end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;

  update public.product_change_tasks
     set status = 'cancelled', resolution_reason = v_reason
   where id = p_task_id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, v_assignee_id, 'product_change_task', p_task_id, 'cancelled',
    coalesce(v_actor_name, '사용자') || '님이 ' || v_product_name || ' 변경 적용업무를 취소했습니다.',
    jsonb_build_object('reason', v_reason)
  );
end;
$$;

create or replace function public.cancel_change_application(
  p_change_application_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_application public.change_applications%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_is_leader boolean;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() then raise exception 'permission denied'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'cancellation reason is required'; end if;

  select * into v_application
    from public.change_applications
   where id = p_change_application_id
   for update;
  if not found then raise exception 'change application not found'; end if;
  if v_application.status = 'cancelled' then raise exception 'change application is already cancelled'; end if;
  v_is_leader := public.is_active_leader();
  if v_application.created_by <> v_actor_id and not v_is_leader then raise exception 'permission denied'; end if;
  if not v_is_leader and v_application.content_locked_at is not null then
    raise exception 'creator cannot cancel after task processing has started';
  end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;

  update public.product_change_tasks task
     set status = 'cancelled', resolution_reason = v_reason
    from public.change_action_items action_item
   where action_item.id = task.action_item_id
     and action_item.change_application_id = v_application.id
     and task.status = 'pending';

  update public.change_applications
     set status = 'cancelled', cancelled_at = now(), cancellation_reason = v_reason
   where id = v_application.id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, null, 'change_application', v_application.id, 'cancelled',
    coalesce(v_actor_name, '사용자') || '님이 ' || v_application.change_number || ' 변경건을 취소했습니다.',
    jsonb_build_object('reason', v_reason)
  );
end;
$$;

revoke all on function public.complete_product_change_task(uuid, text, text) from public, anon;
revoke all on function public.mark_product_change_task_not_applicable(uuid, text, text) from public, anon;
revoke all on function public.reopen_product_change_task(uuid, text) from public, anon;
revoke all on function public.reassign_product_change_tasks(uuid[], uuid, text) from public, anon;
revoke all on function public.cancel_product_change_task(uuid, text) from public, anon;
revoke all on function public.cancel_change_application(uuid, text) from public, anon;

grant execute on function public.complete_product_change_task(uuid, text, text) to authenticated;
grant execute on function public.mark_product_change_task_not_applicable(uuid, text, text) to authenticated;
grant execute on function public.reopen_product_change_task(uuid, text) to authenticated;
grant execute on function public.reassign_product_change_tasks(uuid[], uuid, text) to authenticated;
grant execute on function public.cancel_product_change_task(uuid, text) to authenticated;
grant execute on function public.cancel_change_application(uuid, text) to authenticated;

-- Product ownership changes are explicit. A leader can add the new product
-- assignee and, after reviewing the count in the UI, transfer only published
-- pending change tasks in the same transaction.
create or replace function public.assign_product_and_transfer_change_tasks(
  p_product_id uuid,
  p_user_id uuid,
  p_transfer_pending boolean,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_assignee_name text;
  v_product_name text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_task record;
  v_transferred integer := 0;
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.is_active_leader() then raise exception 'permission denied'; end if;
  if coalesce(p_transfer_pending, false) and (v_reason is null or char_length(v_reason) > 2000) then
    raise exception 'transfer reason is required';
  end if;

  select product.name into v_product_name
    from public.products product
   where product.id = p_product_id
   for update;
  if not found then raise exception 'product not found'; end if;

  perform public.require_profile_role(p_user_id, 'member', 'product_assignments.user_id');
  select profile.name into v_assignee_name
    from public.profiles profile
   where profile.id = p_user_id
     and profile.is_active;
  if not found then raise exception 'product_assignments.user_id must reference an active profile'; end if;
  select profile.name into v_actor_name from public.profiles profile where profile.id = v_actor_id;

  insert into public.product_assignments (product_id, user_id)
  values (p_product_id, p_user_id)
  on conflict (user_id, product_id) do nothing;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, p_user_id, 'product_assignment', p_product_id, 'assigned',
    coalesce(v_actor_name, '파트장') || '님이 ' || v_product_name || ' 담당자로 ' || v_assignee_name || '님을 배정했습니다.',
    jsonb_build_object('user_id', p_user_id, 'transfer_pending', coalesce(p_transfer_pending, false))
  );

  if coalesce(p_transfer_pending, false) then
    for v_task in
      select task.id, task.assignee_id, task.product_name
        from public.product_change_tasks task
        join public.change_action_items action_item on action_item.id = task.action_item_id
        join public.change_applications application on application.id = action_item.change_application_id
       where task.product_id = p_product_id
         and task.status = 'pending'
         and task.assignee_id is distinct from p_user_id
         and application.status = 'published'
       order by task.id
       for update of task
    loop
      update public.product_change_tasks
         set assignee_id = p_user_id,
             assignee_name = v_assignee_name
       where id = v_task.id;

      insert into public.activity_logs (
        actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
      ) values (
        v_actor_id, p_user_id, 'product_change_task', v_task.id, 'reassigned',
        coalesce(v_actor_name, '파트장') || '님이 ' || v_task.product_name || ' 변경 적용 담당자를 ' || v_assignee_name || '님으로 이관했습니다.',
        jsonb_build_object(
          'from_assignee_id', v_task.assignee_id,
          'to_assignee_id', p_user_id,
          'reason', v_reason,
          'source', 'product_assignment_change'
        )
      );
      v_transferred := v_transferred + 1;
    end loop;
  end if;

  return v_transferred;
end;
$$;

revoke all on function public.assign_product_and_transfer_change_tasks(uuid, uuid, boolean, text) from public, anon;
grant execute on function public.assign_product_and_transfer_change_tasks(uuid, uuid, boolean, text) to authenticated;

do $$
begin
  if to_regprocedure('private.record_mutation_audit()') is null then
    raise exception 'private.record_mutation_audit() must exist before change application audit is enabled';
  end if;
end $$;

create trigger change_applications_private_audit
after insert or update or delete on public.change_applications
for each row execute function private.record_mutation_audit('change_application');

create trigger change_action_items_private_audit
after insert or update or delete on public.change_action_items
for each row execute function private.record_mutation_audit('change_action_item');

create trigger product_change_tasks_private_audit
after insert or update or delete on public.product_change_tasks
for each row execute function private.record_mutation_audit('product_change_task');
