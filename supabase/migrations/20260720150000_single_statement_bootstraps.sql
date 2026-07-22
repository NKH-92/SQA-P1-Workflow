-- Single-statement bootstrap snapshots.
-- Auth guards remain short PL/pgSQL prologue statements; every correlated
-- entity list is assembled inside ONE final SELECT so PostgreSQL uses a
-- single statement snapshot (VOLATILE multi-SELECT INTO is insufficient).

create or replace function public.get_review_bootstrap_v2()
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
    with ctx as (
      select
        v_actor_id as actor_id,
        (select role from public.profiles where id = v_actor_id) as role,
        clock_timestamp() as snapshot,
        case
          when (select role from public.profiles where id = v_actor_id) = 'leader'
            then array['submitted', 'resubmitted']::text[]
          else array['approved', 'rejected', 'reopened', 'feedback_added', 'feedback_updated', 'feedback_voided']::text[]
        end as relevant_types
    ),
    visible_requests as (
      select request.*
        from public.review_requests request, ctx
       where (public.is_active_leader() or request.requester_id = ctx.actor_id)
         and (
           request.status = 'pending'
           or (request.status in ('approved', 'rejected') and request.closed_at >= ctx.snapshot - interval '6 months')
         )
    ),
    feedback_agg as (
      select feedback.review_request_id,
             jsonb_agg(
               jsonb_build_object(
                 'id', feedback.id,
                 'review_request_id', feedback.review_request_id,
                 'leader_id', feedback.leader_id,
                 'author_role', feedback.author_role,
                 'comment', feedback.comment,
                 'created_at', feedback.created_at,
                 'updated_at', feedback.updated_at,
                 'voided_at', feedback.voided_at,
                 'voided_by', feedback.voided_by,
                 'void_reason', feedback.void_reason,
                 'profiles', jsonb_build_object('name', leader_profile.name)
               )
               order by feedback.created_at asc
             ) as feedback_json
        from public.review_feedback feedback
        left join public.profiles leader_profile on leader_profile.id = feedback.leader_id
       where feedback.review_request_id in (select id from visible_requests)
       group by feedback.review_request_id
    ),
    request_rows as (
      select
        coalesce(jsonb_agg(
          jsonb_build_object(
            'id', request.id,
            'requester_id', request.requester_id,
            'title', request.title,
            'description', request.description,
            'due_date', request.due_date,
            'status', request.status,
            'review_round', request.review_round,
            'rejection_count', request.rejection_count,
            'last_submitted_at', request.last_submitted_at,
            'status_changed_at', request.status_changed_at,
            'closed_at', request.closed_at,
            'withdrawn_at', request.withdrawn_at,
            'withdrawn_by', request.withdrawn_by,
            'withdrawal_reason', request.withdrawal_reason,
            'created_at', request.created_at,
            'updated_at', request.updated_at,
            'profiles', jsonb_build_object('name', requester_profile.name, 'email', requester_profile.email),
            'review_feedback', coalesce(feedback_agg.feedback_json, '[]'::jsonb)
          )
          order by request.created_at desc
        ), '[]'::jsonb) as requests,
        coalesce(array_agg(request.id), array[]::uuid[]) as request_ids
        from visible_requests request
        left join public.profiles requester_profile on requester_profile.id = request.requester_id
        left join feedback_agg on feedback_agg.review_request_id = request.id
    ),
    latest_events as (
      select distinct on (event.review_request_id) event.*
        from public.review_events event
        cross join request_rows
        cross join ctx
       where event.review_request_id = any(request_rows.request_ids)
         and event.event_type = any(ctx.relevant_types)
       order by event.review_request_id, event.id desc
    ),
    event_rows as (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', event.id, 'review_request_id', event.review_request_id, 'actor_id', event.actor_id,
          'actor_name_snapshot', event.actor_name_snapshot, 'event_type', event.event_type,
          'from_status', event.from_status, 'to_status', event.to_status,
          'occurred_at', event.occurred_at, 'metadata', event.metadata, 'transaction_id', event.transaction_id
        )), '[]'::jsonb) as events
        from latest_events event
    ),
    receipt_rows as (
      select coalesce(jsonb_agg(jsonb_build_object(
          'user_id', receipt.user_id, 'review_request_id', receipt.review_request_id,
          'last_seen_event_id', receipt.last_seen_event_id, 'read_at', receipt.read_at
        )), '[]'::jsonb) as receipts
        from public.review_read_receipts receipt
        cross join request_rows
        cross join ctx
       where receipt.user_id = ctx.actor_id
         and receipt.review_request_id = any(request_rows.request_ids)
    ),
    unread_rows as (
      select count(*)::integer as unread_count
        from latest_events latest
        cross join ctx
        left join public.review_read_receipts receipt
          on receipt.user_id = ctx.actor_id and receipt.review_request_id = latest.review_request_id
       where receipt.last_seen_event_id is null or receipt.last_seen_event_id < latest.id
    )
    select jsonb_build_object(
      'schema_version', 2,
      'snapshot_at', ctx.snapshot,
      'requests', request_rows.requests,
      'events', event_rows.events,
      'read_receipts', receipt_rows.receipts,
      'unread_count', unread_rows.unread_count
    )
      from ctx, request_rows, event_rows, receipt_rows, unread_rows
  );
end;
$$;

create or replace function public.get_core_bootstrap_v2()
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
    with ctx as (
      select v_actor_id as actor_id, public.is_active_leader() as is_leader, clock_timestamp() as snapshot
    )
    select jsonb_build_object(
      'schema_version', 1,
      'snapshot_at', ctx.snapshot,
      'data', jsonb_build_object(
        'profiles', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', profile.id, 'email', profile.email, 'name', profile.name, 'role', profile.role,
              'is_active', profile.is_active, 'created_at', profile.created_at, 'updated_at', profile.updated_at,
              'must_change_password', profile.must_change_password
            ) order by profile.name), '[]'::jsonb)
            from public.profiles profile
           where profile.id = ctx.actor_id or ctx.is_leader
        ),
        'products', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', product.id, 'name', product.name, 'category', product.category,
              'company_name', product.company_name, 'unassigned_reason', product.unassigned_reason,
              'sort_order', product.sort_order, 'created_at', product.created_at, 'updated_at', product.updated_at
            ) order by product.sort_order nulls last, product.name), '[]'::jsonb)
            from public.products product
           where ctx.is_leader
              or exists (
                select 1 from public.product_assignments pa
                 where pa.product_id = product.id and pa.user_id = ctx.actor_id
              )
        ),
        'duty_major_categories', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', category.id, 'name', category.name, 'sort_order', category.sort_order,
              'created_at', category.created_at, 'updated_at', category.updated_at
            ) order by category.sort_order nulls last, category.name), '[]'::jsonb)
            from public.duty_major_categories category
           where ctx.is_leader
              or exists (
                select 1
                  from public.duties d
                  join public.duty_assignments da on da.duty_id = d.id
                 where d.major_category_id = category.id and da.user_id = ctx.actor_id
              )
        ),
        'duties', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', duty.id, 'name', duty.name, 'major_category_id', duty.major_category_id,
              'sort_order', duty.sort_order, 'assignee_label', duty.assignee_label, 'notes', duty.notes,
              'created_at', duty.created_at, 'updated_at', duty.updated_at,
              'duty_major_categories', jsonb_build_object('name', category.name, 'sort_order', category.sort_order)
            ) order by duty.sort_order nulls last, duty.name), '[]'::jsonb)
            from public.duties duty
            left join public.duty_major_categories category on category.id = duty.major_category_id
           where ctx.is_leader
              or exists (
                select 1 from public.duty_assignments da
                 where da.duty_id = duty.id and da.user_id = ctx.actor_id
              )
        ),
        'product_assignments', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', assignment.id, 'user_id', assignment.user_id, 'product_id', assignment.product_id,
              'created_at', assignment.created_at, 'updated_at', assignment.updated_at,
              'profiles', jsonb_build_object('name', profile.name, 'email', profile.email),
              'products', jsonb_build_object(
                'name', product.name, 'category', product.category,
                'company_name', product.company_name, 'sort_order', product.sort_order
              )
            ) order by assignment.created_at desc), '[]'::jsonb)
            from public.product_assignments assignment
            left join public.profiles profile on profile.id = assignment.user_id
            left join public.products product on product.id = assignment.product_id
           where assignment.user_id = ctx.actor_id or ctx.is_leader
        ),
        'duty_assignments', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', assignment.id, 'user_id', assignment.user_id, 'duty_id', assignment.duty_id,
              'created_at', assignment.created_at,
              'profiles', jsonb_build_object('name', profile.name, 'email', profile.email),
              'duties', jsonb_build_object(
                'name', duty.name, 'major_category_id', duty.major_category_id,
                'duty_major_categories', jsonb_build_object('name', category.name)
              )
            ) order by assignment.created_at desc), '[]'::jsonb)
            from public.duty_assignments assignment
            left join public.profiles profile on profile.id = assignment.user_id
            left join public.duties duty on duty.id = assignment.duty_id
            left join public.duty_major_categories category on category.id = duty.major_category_id
           where assignment.user_id = ctx.actor_id or ctx.is_leader
        ),
        'projects', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', project.id, 'name', project.name, 'description', project.description,
              'deadline', project.deadline, 'status', project.status, 'created_by', project.created_by,
              'created_at', project.created_at, 'updated_at', project.updated_at
            ) order by project.created_at desc), '[]'::jsonb)
            from public.projects project
           where ctx.is_leader
              or exists (
                select 1 from public.project_assignments pa
                 where pa.project_id = project.id and pa.user_id = ctx.actor_id
              )
        ),
        'project_assignments', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', assignment.id, 'project_id', assignment.project_id, 'user_id', assignment.user_id,
              'notes', assignment.notes, 'created_at', assignment.created_at, 'updated_at', assignment.updated_at,
              'profiles', jsonb_build_object('name', profile.name, 'email', profile.email),
              'projects', jsonb_build_object(
                'name', project.name, 'description', project.description,
                'deadline', project.deadline, 'status', project.status
              )
            ) order by assignment.created_at desc), '[]'::jsonb)
            from public.project_assignments assignment
            left join public.profiles profile on profile.id = assignment.user_id
            left join public.projects project on project.id = assignment.project_id
           where assignment.user_id = ctx.actor_id or ctx.is_leader
        )
      ),
      'warnings', '[]'::jsonb
    )
      from ctx
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
  v_actor_id uuid := auth.uid();
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;

  return (
    with ctx as (
      select v_actor_id as actor_id, public.is_active_leader() as is_leader, clock_timestamp() as snapshot
    )
    select jsonb_build_object(
      'schema_version', 1,
      'snapshot_at', ctx.snapshot,
      'data', jsonb_build_object(
        'change_applications', (
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
            from public.change_applications application
            left join public.profiles creator on creator.id = application.created_by
           where ctx.is_leader
              or application.created_by = ctx.actor_id
              or (application.published_at is not null and application.status in ('published', 'cancelled'))
        ),
        'change_action_items', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', item.id, 'change_application_id', item.change_application_id, 'kind', item.kind,
              'custom_kind_name', item.custom_kind_name, 'content', item.content, 'due_date', item.due_date,
              'sort_order', item.sort_order, 'created_at', item.created_at, 'updated_at', item.updated_at
            ) order by item.sort_order), '[]'::jsonb)
            from public.change_action_items item
            join public.change_applications application on application.id = item.change_application_id
           where ctx.is_leader
              or application.created_by = ctx.actor_id
              or (application.published_at is not null and application.status in ('published', 'cancelled'))
        ),
        'product_change_tasks', (
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
            from public.product_change_tasks task
            join public.change_action_items action_item on action_item.id = task.action_item_id
            join public.change_applications application on application.id = action_item.change_application_id
            left join public.products product on product.id = task.product_id
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
        ),
        'change_product_scope', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'product_id', scope.product_id, 'product_name', scope.product_name, 'category', scope.category,
              'company_name', scope.company_name, 'sort_order', scope.sort_order,
              'assignee_id', scope.assignee_id, 'assignee_name', scope.assignee_name
            )), '[]'::jsonb)
            from public.list_change_application_product_scope() scope
        ),
        'change_assignee_options', (
          select coalesce(jsonb_agg(jsonb_build_object(
              'id', assignee.id, 'name', assignee.name, 'role', assignee.role
            )), '[]'::jsonb)
            from public.list_change_application_assignees() assignee
        )
      ),
      'warnings', '[]'::jsonb
    )
      from ctx
  );
end;
$$;

comment on function public.get_review_bootstrap_v2() is
  'Bounded review bootstrap assembled in one SELECT snapshot.';
comment on function public.get_core_bootstrap_v2() is
  'Core reference bootstrap assembled in one SELECT snapshot.';
comment on function public.get_change_bootstrap_v2() is
  'Change bootstrap assembled in one SELECT snapshot.';
