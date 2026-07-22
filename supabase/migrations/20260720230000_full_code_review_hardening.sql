-- Fresh whole-code review hardening: add bigint-safe feeds, restore narrow
-- INSERT ACLs, and add versioned deletes. This is an expand release: legacy
-- authenticated write surfaces remain available until the new Worker has been
-- deployed and verified. Anonymous/public execution is still denied.

revoke all on function public.replace_project_assignments(uuid, uuid[]) from public, anon;
revoke all on function public.replace_product_assignments(uuid, uuid[]) from public, anon;
revoke all on function public.replace_product_assignments_with_reason(uuid, uuid[], text) from public, anon;
revoke all on function public.replace_duty_assignments(uuid, uuid[]) from public, anon;
revoke all on function public.add_product_assignment(uuid, uuid) from public, anon;
revoke all on function public.add_duty_assignment(uuid, uuid) from public, anon;
grant execute on function public.replace_project_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.replace_product_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.replace_product_assignments_with_reason(uuid, uuid[], text) to authenticated;
grant execute on function public.replace_duty_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.add_product_assignment(uuid, uuid) to authenticated;
grant execute on function public.add_duty_assignment(uuid, uuid) to authenticated;

grant insert on table public.profile_notes, public.activity_logs to authenticated;

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
  v_inserted boolean := false;
  v_task record;
  v_transferred integer := 0;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if coalesce(p_transfer_pending, false) and (v_reason is null or char_length(v_reason) > 2000) then
    raise exception 'transfer reason is required';
  end if;

  select product.name into v_product_name from public.products product
   where product.id = p_product_id for update;
  if not found then raise exception 'product not found'; end if;
  perform public.require_profile_role(p_user_id, 'member', 'product_assignments.user_id');
  select profile.name into v_assignee_name from public.profiles profile
   where profile.id = p_user_id and profile.is_active;
  if not found then raise exception 'product_assignments.user_id must reference an active profile'; end if;
  select profile.name into v_actor_name from public.profiles profile where profile.id = v_actor_id;

  insert into public.product_assignments (product_id, user_id)
  values (p_product_id, p_user_id)
  on conflict (user_id, product_id) do nothing;
  v_inserted := found;

  if v_inserted then
    update public.products set updated_at = clock_timestamp() where id = p_product_id;
    insert into public.activity_logs (
      actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
    ) values (
      v_actor_id, p_user_id, 'product_assignment', p_product_id, 'assigned',
      coalesce(v_actor_name, '파트장') || '님이 ' || v_product_name || ' 담당자로 ' || v_assignee_name || '님을 배정했습니다.',
      jsonb_build_object('user_id', p_user_id, 'transfer_pending', coalesce(p_transfer_pending, false))
    );
  end if;

  if coalesce(p_transfer_pending, false) then
    for v_task in
      select task.id, task.assignee_id, task.product_name
        from public.product_change_tasks task
        join public.change_action_items item on item.id = task.action_item_id
        join public.change_applications application on application.id = item.change_application_id
       where task.product_id = p_product_id and task.status = 'pending'
         and task.assignee_id is distinct from p_user_id and application.status = 'published'
       order by task.id for update of task
    loop
      update public.product_change_tasks
         set assignee_id = p_user_id, assignee_name = v_assignee_name
       where id = v_task.id;
      insert into public.activity_logs (
        actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
      ) values (
        v_actor_id, p_user_id, 'product_change_task', v_task.id, 'reassigned',
        coalesce(v_actor_name, '파트장') || '님이 ' || v_task.product_name || ' 변경 적용 담당자를 ' || v_assignee_name || '님으로 이관했습니다.',
        jsonb_build_object('from_assignee_id', v_task.assignee_id, 'to_assignee_id', p_user_id, 'reason', v_reason, 'source', 'product_assignment_change')
      );
      v_transferred := v_transferred + 1;
    end loop;
  end if;
  return v_transferred;
end;
$$;

alter function public.get_review_bootstrap_v2() rename to get_review_bootstrap_v2_numeric_ids;
alter function public.get_review_bootstrap_v2_numeric_ids() set schema private;
revoke all on function private.get_review_bootstrap_v2_numeric_ids() from public, anon, authenticated;
alter function private.get_review_bootstrap_v2_numeric_ids() stable;

create function public.get_review_bootstrap_v2()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with source as materialized (
    select private.get_review_bootstrap_v2_numeric_ids() as envelope
  ), events as (
    select coalesce(jsonb_agg(
      jsonb_set(
        jsonb_set(value, '{id}', to_jsonb(value ->> 'id'), true),
        '{transaction_id}', coalesce(to_jsonb(value ->> 'transaction_id'), 'null'::jsonb), true
      ) order by ordinal
    ), '[]'::jsonb) as rows
    from source, jsonb_array_elements(source.envelope -> 'events') with ordinality item(value, ordinal)
  ), receipts as (
    select coalesce(jsonb_agg(
      jsonb_set(value, '{last_seen_event_id}', to_jsonb(value ->> 'last_seen_event_id'), true)
      order by ordinal
    ), '[]'::jsonb) as rows
    from source, jsonb_array_elements(source.envelope -> 'read_receipts') with ordinality item(value, ordinal)
  )
  select jsonb_set(jsonb_set(source.envelope, '{events}', events.rows, true), '{read_receipts}', receipts.rows, true)
  from source, events, receipts
$$;
revoke all on function public.get_review_bootstrap_v2() from public, anon, authenticated;
grant execute on function public.get_review_bootstrap_v2() to authenticated;

create function public.list_audit_events_v2(
  p_limit integer default 50,
  p_before_id text default null
)
returns table (
  id text, entity_type text, entity_id uuid, action text, actor_id uuid,
  actor_name text, changed_fields text[], before_delta jsonb, after_delta jsonb,
  reason text, source text, changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_before_id bigint;
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_before_id is not null then
    if p_before_id !~ '^[0-9]+$' then raise exception 'invalid audit cursor'; end if;
    begin v_before_id := p_before_id::bigint;
    exception when numeric_value_out_of_range then raise exception 'invalid audit cursor'; end;
  end if;
  return query select event.id::text, event.entity_type, event.entity_id, event.action,
    event.actor_id, event.actor_name, event.changed_fields, event.before_delta,
    event.after_delta, event.reason, event.source, event.changed_at
  from private.audit_events event
  where v_before_id is null or event.id < v_before_id
  order by event.id desc limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;
revoke all on function public.list_audit_events_v2(integer, text) from public, anon, authenticated;
grant execute on function public.list_audit_events_v2(integer, text) to authenticated;
revoke all on function public.list_audit_events(integer, bigint) from public, anon;
grant execute on function public.list_audit_events(integer, bigint) to authenticated;

create or replace function private.delete_versioned_row(
  p_table regclass, p_id uuid, p_expected_updated_at timestamptz,
  p_reason text, p_source text, p_correlation_id uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare v_name text; v_updated_at timestamptz; v_row_count integer; v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_expected_updated_at is null or v_reason is null then
    raise exception using errcode = 'P0001', message = 'revision and reason required', detail = 'SQA_MASTER_INPUT_REQUIRED';
  end if;
  execute format('select name, updated_at from %s where id = $1 for update', p_table)
    into v_name, v_updated_at using p_id;
  get diagnostics v_row_count = row_count;
  if v_row_count = 0 then raise exception using errcode = 'P0001', message = 'record not found', detail = 'SQA_MASTER_NOT_FOUND'; end if;
  if v_updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'record changed since it was opened', detail = 'SQA_MASTER_STALE';
  end if;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', p_source, true);
  if p_correlation_id is not null then perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true); end if;
  execute format('delete from %s where id = $1', p_table) using p_id;
  return v_name;
end;
$$;
revoke all on function private.delete_versioned_row(regclass, uuid, timestamptz, text, text, uuid) from public, anon, authenticated;

create or replace function public.delete_product_if_current(p_id uuid, p_expected_updated_at timestamptz, p_reason text, p_correlation_id uuid default null) returns text language sql security definer set search_path = '' as $$ select private.delete_versioned_row('public.products'::regclass, p_id, p_expected_updated_at, p_reason, 'delete_product_if_current', p_correlation_id) $$;
create or replace function public.delete_duty_if_current(p_id uuid, p_expected_updated_at timestamptz, p_reason text, p_correlation_id uuid default null) returns text language sql security definer set search_path = '' as $$ select private.delete_versioned_row('public.duties'::regclass, p_id, p_expected_updated_at, p_reason, 'delete_duty_if_current', p_correlation_id) $$;
create or replace function public.delete_duty_major_category_if_current(p_id uuid, p_expected_updated_at timestamptz, p_reason text, p_correlation_id uuid default null) returns text language sql security definer set search_path = '' as $$ select private.delete_versioned_row('public.duty_major_categories'::regclass, p_id, p_expected_updated_at, p_reason, 'delete_duty_major_category_if_current', p_correlation_id) $$;
create or replace function public.delete_allowed_user_if_current(p_id uuid, p_expected_updated_at timestamptz, p_reason text, p_correlation_id uuid default null) returns text language sql security definer set search_path = '' as $$ select private.delete_versioned_row('public.allowed_users'::regclass, p_id, p_expected_updated_at, p_reason, 'delete_allowed_user_if_current', p_correlation_id) $$;
create or replace function public.delete_project_if_current(p_id uuid, p_expected_updated_at timestamptz, p_reason text, p_correlation_id uuid default null) returns text language sql security definer set search_path = '' as $$ select private.delete_versioned_row('public.projects'::regclass, p_id, p_expected_updated_at, p_reason, 'delete_project_if_current', p_correlation_id) $$;

revoke all on function public.delete_product_if_current(uuid,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.delete_duty_if_current(uuid,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.delete_duty_major_category_if_current(uuid,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.delete_allowed_user_if_current(uuid,timestamptz,text,uuid) from public,anon,authenticated;
revoke all on function public.delete_project_if_current(uuid,timestamptz,text,uuid) from public,anon,authenticated;
grant execute on function public.delete_product_if_current(uuid,timestamptz,text,uuid) to authenticated;
grant execute on function public.delete_duty_if_current(uuid,timestamptz,text,uuid) to authenticated;
grant execute on function public.delete_duty_major_category_if_current(uuid,timestamptz,text,uuid) to authenticated;
grant execute on function public.delete_allowed_user_if_current(uuid,timestamptz,text,uuid) to authenticated;
grant execute on function public.delete_project_if_current(uuid,timestamptz,text,uuid) to authenticated;

-- Keep direct DELETE available for the currently deployed client. Active-
-- leader RLS remains authoritative; a later contract migration may revoke the
-- ACL after all clients use the versioned RPCs above.
grant delete on table public.products, public.duties, public.duty_major_categories, public.allowed_users, public.projects to authenticated;

-- Bound the long-lived change workspace startup snapshot. Explicit history
-- pagination can expose older rows later without making every startup O(N).
create or replace function public.get_change_bootstrap_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return (
    with ctx as materialized (
      select v_actor_id as actor_id, public.is_active_leader() as is_leader, clock_timestamp() as snapshot
    ), visible_application_candidates as materialized (
      select application.*, creator.name as creator_name
        from public.change_applications application
        left join public.profiles creator on creator.id = application.created_by
        cross join ctx
       where ctx.is_leader
          or application.created_by = ctx.actor_id
          or (application.published_at is not null and application.status in ('published', 'cancelled'))
       order by application.created_at desc, application.id desc
       limit 1001
    ), visible_applications as materialized (
      select *
        from visible_application_candidates
       order by created_at desc, id desc
       limit 1000
    ), visible_action_item_candidates as materialized (
      select item.*
        from public.change_action_items item
        join visible_applications application on application.id = item.change_application_id
       order by item.created_at desc, item.id desc
       limit 5001
    ), visible_action_items as materialized (
      select *
        from visible_action_item_candidates
       order by created_at desc, id desc
       limit 5000
    ), visible_task_candidates as materialized (
      select task.*
        from public.product_change_tasks task
        join visible_action_items action_item on action_item.id = task.action_item_id
        join visible_applications application on application.id = action_item.change_application_id
        cross join ctx
       where (
          ctx.is_leader
          or application.created_by = ctx.actor_id
          or (
            application.published_at is not null
            and application.status in ('published', 'cancelled')
            and task.assignee_id = ctx.actor_id
          )
       )
       and (task.status = 'pending' or task.updated_at >= ctx.snapshot - interval '6 months')
       order by task.updated_at desc, task.id desc
       limit 5001
    ), visible_tasks as materialized (
      select *
        from visible_task_candidates
       order by updated_at desc, id desc
       limit 5000
    ), bootstrap_warnings as materialized (
      select coalesce(jsonb_agg(warning order by ordinal), '[]'::jsonb) as rows
        from (values
          (1, case when exists (select 1 from visible_application_candidates offset 1000 limit 1)
            then '[SQA_CHANGE_APPLICATIONS_TRUNCATED] 변경 신청이 1,000건을 초과해 최신 1,000건만 불러왔습니다.' end),
          (2, case when exists (select 1 from visible_action_item_candidates offset 5000 limit 1)
            then '[SQA_CHANGE_ACTION_ITEMS_TRUNCATED] 변경 항목이 5,000건을 초과해 최신 5,000건만 불러왔습니다.' end),
          (3, case when exists (select 1 from visible_task_candidates offset 5000 limit 1)
            then '[SQA_PRODUCT_CHANGE_TASKS_TRUNCATED] 제품 적용업무가 5,000건을 초과해 최신 5,000건만 불러왔습니다.' end)
        ) warning_rows(ordinal, warning)
       where warning is not null
    )
    select jsonb_build_object(
      'schema_version', 1,
      'snapshot_at', ctx.snapshot,
      'data', jsonb_build_object(
        'change_applications', (
          select coalesce(jsonb_agg(
            (to_jsonb(application) - 'creator_name')
              || jsonb_build_object('profiles', jsonb_build_object('name', application.creator_name))
            order by application.created_at desc, application.id desc
          ), '[]'::jsonb)
          from visible_applications application
        ),
        'change_action_items', (
          select coalesce(jsonb_agg(to_jsonb(item) order by item.sort_order, item.id), '[]'::jsonb)
          from visible_action_items item
        ),
        'product_change_tasks', (
          select coalesce(jsonb_agg(
            to_jsonb(task) || jsonb_build_object('products', jsonb_build_object(
              'name', product.name, 'category', product.category,
              'company_name', product.company_name, 'sort_order', product.sort_order
            )) order by task.updated_at desc, task.id desc
          ), '[]'::jsonb)
          from visible_tasks task
          left join public.products product on product.id = task.product_id
        ),
        'change_product_scope', (
          select coalesce(jsonb_agg(to_jsonb(scope)), '[]'::jsonb)
          from public.list_change_application_product_scope() scope
        ),
        'change_assignee_options', (
          select coalesce(jsonb_agg(to_jsonb(assignee)), '[]'::jsonb)
          from public.list_change_application_assignees() assignee
        )
      ),
      'warnings', bootstrap_warnings.rows
    )
    from ctx
    cross join bootstrap_warnings
  );
end;
$$;
revoke all on function public.get_change_bootstrap_v2() from public, anon, authenticated;
grant execute on function public.get_change_bootstrap_v2() to authenticated;

notify pgrst, 'reload schema';
