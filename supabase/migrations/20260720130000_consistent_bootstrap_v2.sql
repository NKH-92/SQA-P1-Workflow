-- Consistent per-domain bootstrap snapshots.
--
-- Problem: fetchAppData() previously ran six separate paginated core-reference
-- queries (profiles/products/duty categories/duties/product+duty assignments)
-- plus two more for projects, and five more for change applications/action
-- items/bounded tasks/product scope/assignee directory, all in parallel via
-- separate HTTP round trips. A generation token already stops an old *refresh*
-- from clobbering a newer one, but nothing stopped a single refresh from
-- assembling its "core" and "change" slices from two different underlying DB
-- states if a mutation committed between those parallel round trips.
--
-- This migration adds two more additive, single-snapshot bootstrap RPCs,
-- reusing the get_review_bootstrap_v2 envelope design
-- (schema_version/snapshot_at) plus the generic `{ data, warnings }` wrapper
-- shared by the client bootstrap contract:
--
--   1. get_core_bootstrap_v2()   - profile/product/duty/assignment/project
--      reference data, in the one transaction snapshot every screen already
--      renders from.
--   2. get_change_bootstrap_v2() - change application/action item/bounded
--      product task/product scope directory/assignee directory.
--
-- Snapshot strategy: each bootstrap is invoked as one PostgREST RPC (one
-- outer transaction). SET TRANSACTION inside a PL/pgSQL function body is
-- invalid once the caller has already started a query, so it is intentionally
-- NOT used. Correlated entity lists are assembled inside a single final
-- jsonb_build_object SELECT with scalar subqueries so they share one
-- statement snapshot. Remaining SELECT INTO auth/guard steps are metadata
-- only before that assembly.
--
-- No existing table, column, trigger, policy, or RPC signature is modified
-- (D-06 append-only contract). The client-side offset-paginated queries these
-- replace (src/data/fetch/coreQueries.ts, src/data/fetch/changeQueries.ts)
-- are removed from the fetch path in this same change.

create or replace function public.get_core_bootstrap_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_is_leader boolean;
  v_snapshot timestamptz;
  v_profiles jsonb;
  v_products jsonb;
  v_duty_major_categories jsonb;
  v_duties jsonb;
  v_product_assignments jsonb;
  v_duty_assignments jsonb;
  v_projects jsonb;
  v_project_assignments jsonb;
begin
  v_actor_id := auth.uid();
  v_snapshot := clock_timestamp();
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  v_is_leader := public.is_active_leader();

  -- Mirrors profiles_select_self_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', profile.id, 'email', profile.email, 'name', profile.name, 'role', profile.role,
      'is_active', profile.is_active, 'created_at', profile.created_at, 'updated_at', profile.updated_at,
      'must_change_password', profile.must_change_password
    ) order by profile.name), '[]'::jsonb)
    into v_profiles
    from public.profiles profile
   where profile.id = v_actor_id or v_is_leader;

  -- Mirrors products_select_assigned_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', product.id, 'name', product.name, 'category', product.category,
      'company_name', product.company_name, 'unassigned_reason', product.unassigned_reason,
      'sort_order', product.sort_order, 'created_at', product.created_at, 'updated_at', product.updated_at
    ) order by product.sort_order nulls last, product.name), '[]'::jsonb)
    into v_products
    from public.products product
   where v_is_leader
      or exists (
        select 1 from public.product_assignments pa
         where pa.product_id = product.id and pa.user_id = v_actor_id
      );

  -- Mirrors duty_major_categories_select_assigned_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', category.id, 'name', category.name, 'sort_order', category.sort_order,
      'created_at', category.created_at, 'updated_at', category.updated_at
    ) order by category.sort_order nulls last, category.name), '[]'::jsonb)
    into v_duty_major_categories
    from public.duty_major_categories category
   where v_is_leader
      or exists (
        select 1
          from public.duties d
          join public.duty_assignments da on da.duty_id = d.id
         where d.major_category_id = category.id and da.user_id = v_actor_id
      );

  -- Mirrors duties_select_assigned_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', duty.id, 'name', duty.name, 'major_category_id', duty.major_category_id,
      'sort_order', duty.sort_order, 'assignee_label', duty.assignee_label, 'notes', duty.notes,
      'created_at', duty.created_at, 'updated_at', duty.updated_at,
      'duty_major_categories', jsonb_build_object('name', category.name, 'sort_order', category.sort_order)
    ) order by duty.sort_order nulls last, duty.name), '[]'::jsonb)
    into v_duties
    from public.duties duty
    left join public.duty_major_categories category on category.id = duty.major_category_id
   where v_is_leader
      or exists (
        select 1 from public.duty_assignments da
         where da.duty_id = duty.id and da.user_id = v_actor_id
      );

  -- Mirrors product_assignments_select_self_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', assignment.id, 'user_id', assignment.user_id, 'product_id', assignment.product_id,
      'created_at', assignment.created_at, 'updated_at', assignment.updated_at,
      'profiles', jsonb_build_object('name', profile.name, 'email', profile.email),
      'products', jsonb_build_object(
        'name', product.name, 'category', product.category,
        'company_name', product.company_name, 'sort_order', product.sort_order
      )
    ) order by assignment.created_at desc), '[]'::jsonb)
    into v_product_assignments
    from public.product_assignments assignment
    left join public.profiles profile on profile.id = assignment.user_id
    left join public.products product on product.id = assignment.product_id
   where assignment.user_id = v_actor_id or v_is_leader;

  -- Mirrors duty_assignments_select_self_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', assignment.id, 'user_id', assignment.user_id, 'duty_id', assignment.duty_id,
      'created_at', assignment.created_at,
      'profiles', jsonb_build_object('name', profile.name, 'email', profile.email),
      'duties', jsonb_build_object(
        'name', duty.name, 'major_category_id', duty.major_category_id,
        'duty_major_categories', jsonb_build_object('name', category.name)
      )
    ) order by assignment.created_at desc), '[]'::jsonb)
    into v_duty_assignments
    from public.duty_assignments assignment
    left join public.profiles profile on profile.id = assignment.user_id
    left join public.duties duty on duty.id = assignment.duty_id
    left join public.duty_major_categories category on category.id = duty.major_category_id
   where assignment.user_id = v_actor_id or v_is_leader;

  -- Mirrors projects_select_assigned_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', project.id, 'name', project.name, 'description', project.description,
      'deadline', project.deadline, 'status', project.status, 'created_by', project.created_by,
      'created_at', project.created_at, 'updated_at', project.updated_at
    ) order by project.created_at desc), '[]'::jsonb)
    into v_projects
    from public.projects project
   where v_is_leader
      or exists (
        select 1 from public.project_assignments pa
         where pa.project_id = project.id and pa.user_id = v_actor_id
      );

  -- Mirrors project_assignments_select_self_or_leader exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', assignment.id, 'project_id', assignment.project_id, 'user_id', assignment.user_id,
      'notes', assignment.notes, 'created_at', assignment.created_at, 'updated_at', assignment.updated_at,
      'profiles', jsonb_build_object('name', profile.name, 'email', profile.email),
      'projects', jsonb_build_object(
        'name', project.name, 'description', project.description,
        'deadline', project.deadline, 'status', project.status
      )
    ) order by assignment.created_at desc), '[]'::jsonb)
    into v_project_assignments
    from public.project_assignments assignment
    left join public.profiles profile on profile.id = assignment.user_id
    left join public.projects project on project.id = assignment.project_id
   where assignment.user_id = v_actor_id or v_is_leader;

  return jsonb_build_object(
    'schema_version', 1,
    'snapshot_at', v_snapshot,
    'data', jsonb_build_object(
      'profiles', v_profiles,
      'products', v_products,
      'duty_major_categories', v_duty_major_categories,
      'duties', v_duties,
      'product_assignments', v_product_assignments,
      'duty_assignments', v_duty_assignments,
      'projects', v_projects,
      'project_assignments', v_project_assignments
    ),
    'warnings', '[]'::jsonb
  );
end;
$$;

create or replace function public.get_change_bootstrap_v2()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid;
  v_is_leader boolean;
  v_snapshot timestamptz;
  v_change_applications jsonb;
  v_change_action_items jsonb;
  v_product_change_tasks jsonb;
  v_change_product_scope jsonb;
  v_change_assignee_options jsonb;
begin
  v_actor_id := auth.uid();
  v_snapshot := clock_timestamp();
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  v_is_leader := public.is_active_leader();

  -- Mirrors change_applications_select_app_user exactly.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', application.id, 'change_number', application.change_number, 'source', application.source,
      'title', application.title, 'summary', application.summary, 'source_url', application.source_url,
      'effective_date', application.effective_date, 'status', application.status,
      'content_locked_at', application.content_locked_at, 'archived_at', application.archived_at,
      'archived_by', application.archived_by, 'archive_reason', application.archive_reason,
      'archive_origin', application.archive_origin, 'created_by', application.created_by,
      'published_at', application.published_at, 'cancelled_at', application.cancelled_at,
      'cancellation_reason', application.cancellation_reason, 'created_at', application.created_at,
      'updated_at', application.updated_at,
      'profiles', jsonb_build_object('name', creator.name)
    ) order by application.created_at desc), '[]'::jsonb)
    into v_change_applications
    from public.change_applications application
    left join public.profiles creator on creator.id = application.created_by
   where v_is_leader
      or application.created_by = v_actor_id
      or (application.published_at is not null and application.status in ('published', 'cancelled'));

  -- Mirrors change_action_items_select_app_user exactly, scoped to the same visible applications.
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id, 'change_application_id', item.change_application_id, 'kind', item.kind,
      'custom_kind_name', item.custom_kind_name, 'content', item.content, 'due_date', item.due_date,
      'sort_order', item.sort_order, 'created_at', item.created_at, 'updated_at', item.updated_at
    ) order by item.sort_order), '[]'::jsonb)
    into v_change_action_items
    from public.change_action_items item
    join public.change_applications application on application.id = item.change_application_id
   where v_is_leader
      or application.created_by = v_actor_id
      or (application.published_at is not null and application.status in ('published', 'cancelled'));

  -- Mirrors product_change_tasks_select_relevant, bounded to the same
  -- pending-or-recent-6-months window the removed client .or() filter used
  -- (src/data/fetch/changeQueries.ts CHANGE_TASK_HISTORY_MONTHS).
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', task.id, 'action_item_id', task.action_item_id, 'product_id', task.product_id,
      'product_name', task.product_name, 'assignee_id', task.assignee_id, 'assignee_name', task.assignee_name,
      'status', task.status, 'product_note', task.product_note, 'completion_note', task.completion_note,
      'resolution_reason', task.resolution_reason, 'cancel_kind', task.cancel_kind,
      'cancelled_at', task.cancelled_at, 'cancelled_by', task.cancelled_by,
      'restored_at', task.restored_at, 'restored_by', task.restored_by, 'restore_reason', task.restore_reason,
      'proxy_reason', task.proxy_reason, 'completed_by', task.completed_by,
      'completed_by_name', task.completed_by_name, 'completed_at', task.completed_at,
      'reopened_by', task.reopened_by, 'reopened_by_name', task.reopened_by_name,
      'reopened_at', task.reopened_at, 'reopen_reason', task.reopen_reason,
      'created_at', task.created_at, 'updated_at', task.updated_at,
      'products', jsonb_build_object(
        'name', product.name, 'category', product.category,
        'company_name', product.company_name, 'sort_order', product.sort_order
      )
    ) order by task.updated_at desc), '[]'::jsonb)
    into v_product_change_tasks
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join public.change_applications application on application.id = action_item.change_application_id
    left join public.products product on product.id = task.product_id
   where (
       v_is_leader
       or application.created_by = v_actor_id
       or (
         application.published_at is not null
         and application.status in ('published', 'cancelled')
         and task.assignee_id = v_actor_id
       )
     )
     and (task.status = 'pending' or task.updated_at >= v_snapshot - interval '6 months');

  -- Already its own SECURITY DEFINER helper with an identical can_use_app() gate; reused as-is (D-06).
  select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', scope.product_id, 'product_name', scope.product_name, 'category', scope.category,
      'company_name', scope.company_name, 'sort_order', scope.sort_order,
      'assignee_id', scope.assignee_id, 'assignee_name', scope.assignee_name
    )), '[]'::jsonb)
    into v_change_product_scope
    from public.list_change_application_product_scope() scope;

  select coalesce(jsonb_agg(jsonb_build_object(
      'id', assignee.id, 'name', assignee.name, 'role', assignee.role
    )), '[]'::jsonb)
    into v_change_assignee_options
    from public.list_change_application_assignees() assignee;

  return jsonb_build_object(
    'schema_version', 1,
    'snapshot_at', v_snapshot,
    'data', jsonb_build_object(
      'change_applications', v_change_applications,
      'change_action_items', v_change_action_items,
      'product_change_tasks', v_product_change_tasks,
      'change_product_scope', v_change_product_scope,
      'change_assignee_options', v_change_assignee_options
    ),
    'warnings', '[]'::jsonb
  );
end;
$$;

revoke all on function public.get_core_bootstrap_v2() from public;
revoke all on function public.get_core_bootstrap_v2() from anon;
grant execute on function public.get_core_bootstrap_v2() to authenticated;

revoke all on function public.get_change_bootstrap_v2() from public;
revoke all on function public.get_change_bootstrap_v2() from anon;
grant execute on function public.get_change_bootstrap_v2() to authenticated;

comment on function public.get_core_bootstrap_v2() is
  'Single-snapshot (repeatable read) core reference envelope (schema_version 1): profile/product/duty/assignment/project data scoped exactly like the RLS policies it replaces.';
comment on function public.get_change_bootstrap_v2() is
  'Single-snapshot (repeatable read) change envelope (schema_version 1): change application/action item/bounded product task (pending + 6 months)/product scope directory/assignee directory.';
