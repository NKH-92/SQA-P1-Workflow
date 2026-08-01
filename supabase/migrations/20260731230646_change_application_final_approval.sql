-- Change-application final approval: leader-owned authoring, assignee-only
-- product decisions, explicit final completion/undo, server summaries, and
-- permanently searchable history. Existing archive rows are not rewritten.

alter table public.change_applications
  add column final_completed_at timestamptz,
  add column final_completed_by uuid references public.profiles(id) on delete restrict,
  add column final_completed_by_name text,
  add column final_completion_note text;

alter table public.change_applications
  add constraint change_applications_final_completion_state_check check (
    (
      final_completed_at is null
      and final_completed_by is null
      and final_completed_by_name is null
      and final_completion_note is null
    )
    or
    (
      final_completed_at is not null
      and final_completed_by is not null
      and nullif(btrim(final_completed_by_name), '') is not null
      and status = 'published'
      and archived_at is not null
      and archived_by = final_completed_by
    )
  ),
  add constraint change_applications_final_completed_by_name_length_check
    check (final_completed_by_name is null or char_length(final_completed_by_name) between 1 and 200),
  add constraint change_applications_final_completion_note_length_check
    check (final_completion_note is null or char_length(final_completion_note) between 1 and 2000);

create index change_applications_final_completed_idx
  on public.change_applications(final_completed_at desc, id desc)
  where final_completed_at is not null;

create index change_applications_history_keyset_idx
  on public.change_applications((case
    when status = 'cancelled' then cancelled_at
    else coalesce(final_completed_at, archived_at)
  end) desc, id desc)
  where archived_at is not null or status = 'cancelled';

create index product_change_tasks_history_product_idx
  on public.product_change_tasks(product_id, action_item_id);

create index product_change_tasks_history_assignee_idx
  on public.product_change_tasks(assignee_id, action_item_id)
  where assignee_id is not null;

create index product_change_tasks_history_completed_by_idx
  on public.product_change_tasks(completed_by, action_item_id)
  where completed_by is not null;

-- Product-task ownership history is authorization data, not disposable UX
-- telemetry. Backfill every durable source available before activity-log
-- retention can remove old reassignment rows, then keep it current by trigger.
create table private.product_change_task_assignee_history (
  task_id uuid not null references public.product_change_tasks(id) on delete cascade,
  assignee_id uuid not null,
  first_recorded_at timestamptz not null default clock_timestamp(),
  primary key (task_id, assignee_id)
);

create index product_change_task_assignee_history_assignee_idx
  on private.product_change_task_assignee_history(assignee_id, task_id);

revoke all on table private.product_change_task_assignee_history
  from public, anon, authenticated;

with candidate_history(task_id, assignee_id, recorded_at) as (
  select task.id, task.assignee_id, coalesce(task.updated_at, task.created_at)
    from public.product_change_tasks task
   where task.assignee_id is not null
  union all
  select task.id, task.completed_by, coalesce(task.completed_at, task.updated_at, task.created_at)
    from public.product_change_tasks task
   where task.completed_by is not null
  union all
  select activity.entity_id, activity.target_user_id, activity.created_at
    from public.activity_logs activity
   where activity.entity_type = 'product_change_task'
     and activity.entity_id is not null
     and activity.target_user_id is not null
  union all
  select activity.entity_id,
         (activity.metadata ->> 'from_assignee_id')::uuid,
         activity.created_at
    from public.activity_logs activity
   where activity.entity_type = 'product_change_task'
     and activity.entity_id is not null
     and activity.metadata ->> 'from_assignee_id'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  union all
  select activity.entity_id,
         (activity.metadata ->> 'to_assignee_id')::uuid,
         activity.created_at
    from public.activity_logs activity
   where activity.entity_type = 'product_change_task'
     and activity.entity_id is not null
     and activity.metadata ->> 'to_assignee_id'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  union all
  select audit.entity_id,
         (audit.before_delta ->> 'assignee_id')::uuid,
         audit.changed_at
    from private.audit_events audit
   where audit.entity_type = 'product_change_task'
     and audit.entity_id is not null
     and audit.before_delta ->> 'assignee_id'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  union all
  select audit.entity_id,
         (audit.after_delta ->> 'assignee_id')::uuid,
         audit.changed_at
    from private.audit_events audit
   where audit.entity_type = 'product_change_task'
     and audit.entity_id is not null
     and audit.after_delta ->> 'assignee_id'
       ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
insert into private.product_change_task_assignee_history (
  task_id, assignee_id, first_recorded_at
)
select candidate.task_id, candidate.assignee_id, min(candidate.recorded_at)
  from candidate_history candidate
  join public.product_change_tasks task on task.id = candidate.task_id
 where candidate.assignee_id is not null
 group by candidate.task_id, candidate.assignee_id
on conflict (task_id, assignee_id) do nothing;

create or replace function private.capture_product_change_task_assignee_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.assignee_id is not null then
    insert into private.product_change_task_assignee_history (task_id, assignee_id)
    values (old.id, old.assignee_id)
    on conflict (task_id, assignee_id) do nothing;
  end if;

  if new.assignee_id is not null then
    insert into private.product_change_task_assignee_history (task_id, assignee_id)
    values (new.id, new.assignee_id)
    on conflict (task_id, assignee_id) do nothing;
  end if;

  if new.completed_by is not null then
    insert into private.product_change_task_assignee_history (task_id, assignee_id)
    values (new.id, new.completed_by)
    on conflict (task_id, assignee_id) do nothing;
  end if;

  return new;
end;
$$;

revoke all on function private.capture_product_change_task_assignee_history()
  from public, anon, authenticated;

drop trigger if exists product_change_tasks_capture_assignee_history
  on public.product_change_tasks;
create trigger product_change_tasks_capture_assignee_history
after insert or update of assignee_id, completed_by on public.product_change_tasks
for each row execute function private.capture_product_change_task_assignee_history();

comment on column public.change_applications.final_completed_at is
  'Timestamp of explicit leader final completion. Null on legacy archive rows.';
comment on column public.change_applications.final_completed_by is
  'Active leader who explicitly completed the common change.';
comment on column public.change_applications.final_completed_by_name is
  'Leader name snapshot retained with final completion history.';
comment on column public.change_applications.final_completion_note is
  'Leader final-review note; required when any product is not applicable or scope removed.';

-- Include final-approval fields in the authoritative audit allowlist. This
-- replaces only the current helper definition; existing audit rows remain.
create or replace function private.build_audit_business_snapshot(
  p_entity_type text,
  p_row jsonb
)
returns jsonb
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_allowed_fields text[];
  v_snapshot jsonb;
begin
  if p_row is null then
    return '{}'::jsonb;
  end if;

  v_allowed_fields := case p_entity_type
    when 'profile' then array[
      'id', 'email', 'name', 'role', 'must_change_password', 'is_active', 'created_at'
    ]
    when 'allowed_user' then array[
      'id', 'email', 'name', 'role', 'created_by', 'created_at'
    ]
    when 'profile_note' then array[
      'id', 'profile_id', 'leader_id', 'note', 'created_at'
    ]
    when 'product' then array[
      'id', 'name', 'category', 'company_name', 'unassigned_reason', 'sort_order', 'created_at'
    ]
    when 'product_assignment' then array[
      'id', 'user_id', 'product_id', 'created_at'
    ]
    when 'duty_major_category' then array[
      'id', 'name', 'sort_order', 'created_at'
    ]
    when 'duty' then array[
      'id', 'name', 'major_category_id', 'sort_order', 'assignee_label', 'notes', 'created_at'
    ]
    when 'duty_assignment' then array[
      'id', 'user_id', 'duty_id', 'created_at'
    ]
    when 'review_request' then array[
      'id', 'requester_id', 'title', 'description', 'due_date', 'status',
      'review_round', 'rejection_count', 'last_submitted_at', 'status_changed_at',
      'closed_at', 'withdrawn_at', 'withdrawn_by', 'withdrawal_reason', 'created_at'
    ]
    when 'review_feedback' then array[
      'id', 'review_request_id', 'leader_id', 'author_role', 'comment', 'created_at',
      'voided_at', 'voided_by', 'void_reason'
    ]
    when 'project' then array[
      'id', 'name', 'description', 'deadline', 'status', 'created_by', 'created_at'
    ]
    when 'project_assignment' then array[
      'id', 'project_id', 'user_id', 'notes', 'created_at'
    ]
    when 'announcement' then array[
      'id', 'title', 'body', 'is_pinned', 'pinned_at', 'created_by', 'created_at'
    ]
    when 'change_application' then array[
      'id', 'change_number', 'source', 'title', 'summary', 'source_url',
      'effective_date', 'status', 'content_locked_at', 'archived_at', 'archived_by',
      'archive_reason', 'archive_origin', 'final_completed_at', 'final_completed_by',
      'final_completed_by_name', 'final_completion_note', 'created_by', 'published_at',
      'cancelled_at', 'cancellation_reason', 'created_at'
    ]
    when 'change_action_item' then array[
      'id', 'change_application_id', 'kind', 'custom_kind_name', 'content',
      'due_date', 'sort_order', 'created_at'
    ]
    when 'product_change_task' then array[
      'id', 'action_item_id', 'product_id', 'product_name', 'assignee_id',
      'assignee_name', 'status', 'product_note', 'completion_note', 'resolution_reason',
      'cancel_kind', 'cancelled_at', 'cancelled_by', 'restored_at', 'restored_by',
      'restore_reason', 'proxy_reason', 'completed_by', 'completed_by_name',
      'completed_at', 'reopened_by', 'reopened_by_name', 'reopened_at',
      'reopen_reason', 'created_at'
    ]
    else null
  end;

  if v_allowed_fields is null then
    raise exception using
      errcode = 'P0001',
      message = 'unsupported audit entity type',
      detail = 'SQA_AUDIT_ENTITY_UNSUPPORTED:' || coalesce(p_entity_type, '<null>');
  end if;

  select coalesce(
           pg_catalog.jsonb_object_agg(field.field_name, p_row -> field.field_name),
           '{}'::jsonb
         )
    into v_snapshot
    from pg_catalog.unnest(v_allowed_fields) as field(field_name)
   where pg_catalog.jsonb_exists(p_row, field.field_name);

  return v_snapshot;
end;
$$;

revoke all on function private.build_audit_business_snapshot(text, jsonb)
  from public, anon, authenticated;

-- A final completion is a human archive, while legacy automatic archive
-- detection remains intact for rows created before this migration.
create or replace function private.enforce_archive_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if new.final_completed_at is not null then
      new.archive_origin := 'manual';
      new.archived_by := new.final_completed_by;
    elsif new.archive_reason in (
      '모든 제품 적용이 완료되어 자동 보관됨',
      '모든 제품 적용업무가 처리되어 자동 보관됨'
    ) then
      new.archive_origin := 'automatic';
      new.archived_by := null;
    else
      new.archive_origin := 'manual';
      new.archived_by := coalesce(new.archived_by, auth.uid());
    end if;
  elsif old.archived_at is not null and new.archived_at is null then
    new.archive_origin := null;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_archive_origin() from public, anon, authenticated;

-- Every change mutation follows one lock order: parent application first,
-- then every child task in UUID order. Public RPCs resolve a task's parent
-- without locking and call this helper before reading or updating task state.
create or replace function private.lock_change_application_and_tasks(
  p_change_application_id uuid
)
returns public.change_applications
language plpgsql
set search_path = ''
as $$
declare
  v_application public.change_applications%rowtype;
begin
  select application.*
    into v_application
    from public.change_applications application
   where application.id = p_change_application_id
   for update;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'change application not found',
      detail = 'SQA_CHANGE_APPLICATION_NOT_FOUND';
  end if;

  perform 1
    from public.product_change_tasks task
    join public.change_action_items action_item
      on action_item.id = task.action_item_id
   where action_item.change_application_id = v_application.id
   order by task.id
   for update of task;

  return v_application;
end;
$$;

revoke all on function private.lock_change_application_and_tasks(uuid)
  from public, anon, authenticated;

create or replace function private.require_change_application_id_for_task(
  p_task_id uuid
)
returns uuid
language plpgsql
stable
set search_path = ''
as $$
declare
  v_application_id uuid;
begin
  select action_item.change_application_id
    into v_application_id
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
   where task.id = p_task_id;

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'product change task not found',
      detail = 'SQA_CHANGE_TASK_NOT_FOUND';
  end if;

  return v_application_id;
end;
$$;

revoke all on function private.require_change_application_id_for_task(uuid)
  from public, anon, authenticated;

-- Automatic archive is replaced by an explicit readiness activity. Callers
-- already hold the application and task locks, so this helper never takes a
-- lock in the reverse task-to-application order.
create or replace function private.record_change_application_final_review_readiness(
  p_change_application_id uuid,
  p_final_task_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application public.change_applications%rowtype;
  v_total integer;
  v_pending integer;
  v_completed integer;
  v_not_applicable integer;
  v_scope_removed integer;
  v_unresolved_cancelled integer;
  v_unassigned integer;
begin
  select application.*
    into v_application
    from public.change_applications application
   where application.id = p_change_application_id;

  if not found
     or v_application.status <> 'published'
     or v_application.archived_at is not null
     or v_application.final_completed_at is not null then
    return;
  end if;

  select
    count(*) filter (
      where not (
        task.status = 'cancelled'
        and task.cancel_kind = 'application_cancelled'
      )
    )::integer,
    count(*) filter (where task.status = 'pending')::integer,
    count(*) filter (where task.status = 'completed')::integer,
    count(*) filter (where task.status = 'not_applicable')::integer,
    count(*) filter (
      where task.status = 'cancelled' and task.cancel_kind = 'scope_removed'
    )::integer,
    count(*) filter (
      where task.status = 'cancelled'
        and task.cancel_kind is distinct from 'scope_removed'
        and task.cancel_kind is distinct from 'application_cancelled'
    )::integer,
    count(*) filter (
      where not (
        task.status = 'cancelled'
        and task.cancel_kind in ('scope_removed', 'application_cancelled')
      )
      and (
        task.assignee_id is null
        or assignee.id is null
      )
    )::integer
    into v_total, v_pending, v_completed, v_not_applicable,
         v_scope_removed, v_unresolved_cancelled, v_unassigned
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    left join public.profiles assignee
      on assignee.id = task.assignee_id and assignee.is_active
   where action_item.change_application_id = v_application.id;

  if v_total > 0
     and v_pending = 0
     and v_unresolved_cancelled = 0
     and v_unassigned = 0
     and v_completed + v_not_applicable + v_scope_removed = v_total then
    insert into public.activity_logs (
      actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
    ) values (
      v_actor_id, null, 'change_application', v_application.id, 'final_review_ready',
      v_application.change_number || ' 변경건의 모든 제품 처리가 완료되어 파트장 최종 확인을 기다립니다.',
      jsonb_build_object(
        'final_task_id', p_final_task_id,
        'total_count', v_total,
        'completed_count', v_completed,
        'not_applicable_count', v_not_applicable,
        'scope_removed_count', v_scope_removed
      )
    );
  end if;
end;
$$;

revoke all on function private.record_change_application_final_review_readiness(uuid, uuid)
  from public, anon, authenticated;

drop trigger if exists product_change_tasks_sync_application_archive
  on public.product_change_tasks;
drop trigger if exists product_change_tasks_sync_final_review_readiness
  on public.product_change_tasks;
drop function if exists private.sync_change_application_archive();
drop function if exists private.sync_change_application_final_review_readiness();

-- Keep the latest business-time and scope-history behavior while enforcing
-- leader ownership and the common application-then-task lock order.
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
  v_existing_task public.product_change_tasks%rowtype;
  v_removed_task public.product_change_tasks%rowtype;
  v_last_removed_task_id uuid;
  v_task_count integer;
  v_unique_task_count integer;
  v_was_new boolean := false;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using
      errcode = 'P0001',
      message = 'active leader required',
      detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_change_application_id is null and p_expected_updated_at is not null then
    raise exception using
      errcode = 'P0001',
      message = 'change application was modified by another user',
      detail = 'SQA_CHANGE_APPLICATION_CONFLICT';
  end if;
  if p_source is null then
    raise exception using errcode = '22023', message = 'change source is required', detail = 'SQA_CHANGE_SOURCE_REQUIRED';
  end if;
  if char_length(v_title) not between 1 and 200 then
    raise exception using errcode = '22023', message = 'title is invalid', detail = 'SQA_CHANGE_TITLE_INVALID';
  end if;
  if char_length(v_summary) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'summary is invalid', detail = 'SQA_CHANGE_SUMMARY_INVALID';
  end if;
  if v_source_url is not null and (
    char_length(v_source_url) > 2000 or v_source_url !~* '^https?://'
  ) then
    raise exception using errcode = '22023', message = 'source url must use http or https', detail = 'SQA_CHANGE_SOURCE_URL_INVALID';
  end if;
  if p_effective_date is null then
    raise exception using errcode = '22023', message = 'effective date is required', detail = 'SQA_CHANGE_EFFECTIVE_DATE_REQUIRED';
  end if;
  if p_action_kind is null then
    raise exception using errcode = '22023', message = 'action kind is required', detail = 'SQA_CHANGE_ACTION_KIND_REQUIRED';
  end if;
  if char_length(v_action_content) not between 1 and 5000 then
    raise exception using errcode = '22023', message = 'action content is invalid', detail = 'SQA_CHANGE_ACTION_CONTENT_INVALID';
  end if;
  if p_due_date is null then
    raise exception using errcode = '22023', message = 'due date is required', detail = 'SQA_CHANGE_DUE_DATE_REQUIRED';
  end if;
  if p_action_kind = 'other'
     and (v_custom_kind_name is null or char_length(v_custom_kind_name) > 100) then
    raise exception using errcode = '22023', message = 'custom kind name is required', detail = 'SQA_CHANGE_CUSTOM_KIND_REQUIRED';
  end if;
  if p_action_kind = 'product_standard' then
    v_custom_kind_name := null;
  end if;
  if p_tasks is null
     or jsonb_typeof(p_tasks) <> 'array'
     or jsonb_array_length(p_tasks) = 0 then
    raise exception using errcode = '22023', message = 'at least one product task is required', detail = 'SQA_CHANGE_TASK_REQUIRED';
  end if;

  begin
    if exists (
      select 1
        from jsonb_array_elements(p_tasks) scope
       where nullif(scope ->> 'product_id', '') is null
          or (p_publish and nullif(scope ->> 'assignee_id', '') is null)
    ) then
      raise exception using
        errcode = '22023',
        message = 'each task requires a product and each published task requires an assignee',
        detail = 'SQA_CHANGE_TASK_SCOPE_INVALID';
    end if;

    perform (scope ->> 'product_id')::uuid,
            nullif(scope ->> 'assignee_id', '')::uuid
      from jsonb_array_elements(p_tasks) scope;
  exception
    when invalid_text_representation then
      raise exception using
        errcode = '22023',
        message = 'product and assignee ids must be UUIDs',
        detail = 'SQA_CHANGE_TASK_SCOPE_INVALID';
  end;

  select count(*), count(distinct scope ->> 'product_id')
    into v_task_count, v_unique_task_count
    from jsonb_array_elements(p_tasks) scope;
  if v_task_count <> v_unique_task_count then
    raise exception using errcode = '22023', message = 'duplicate product task', detail = 'SQA_CHANGE_DUPLICATE_PRODUCT';
  end if;

  if v_change_number = '' then
    if p_source = 'official' then
      raise exception using errcode = '22023', message = 'official change number is required', detail = 'SQA_CHANGE_NUMBER_REQUIRED';
    end if;
    v_change_number := case when p_source = 'internal' then 'INT-' else 'ETC-' end
      || private.sqa_business_year()::text || '-'
      || lpad(nextval('public.internal_change_number_seq'::regclass)::text, 4, '0');
  end if;
  if char_length(v_change_number) > 100 then
    raise exception using errcode = '22023', message = 'change number is invalid', detail = 'SQA_CHANGE_NUMBER_INVALID';
  end if;

  select profile.name
    into v_actor_name
    from public.profiles profile
   where profile.id = v_actor_id and profile.is_active and profile.role = 'leader';
  if not found then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;

  perform set_config(
    'sqa.audit_reason',
    case when p_publish then '변경 적용업무 저장 및 게시' else '변경 적용업무 초안 저장' end,
    true
  );
  perform set_config(
    'sqa.audit_source',
    case when p_publish then 'publish_change_application' else 'save_change_application_draft' end,
    true
  );

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
      case when p_publish then clock_timestamp() else null end
    )
    returning * into v_application;
  else
    v_application := private.lock_change_application_and_tasks(p_change_application_id);
    if v_application.status = 'cancelled' then
      raise exception using errcode = 'P0001', message = 'cancelled change application cannot be edited', detail = 'SQA_CHANGE_APPLICATION_CANCELLED';
    end if;
    if v_application.archived_at is not null or v_application.final_completed_at is not null then
      raise exception using errcode = 'P0001', message = 'completed change application cannot be edited', detail = 'SQA_CHANGE_APPLICATION_ALREADY_FINAL';
    end if;
    if p_expected_updated_at is null
       or v_application.updated_at is distinct from p_expected_updated_at then
      raise exception using
        errcode = 'P0001',
        message = 'change application was modified by another user',
        detail = 'SQA_CHANGE_APPLICATION_CONFLICT';
    end if;
    if v_application.status = 'published' and not p_publish then
      raise exception using errcode = 'P0001', message = 'published change application cannot return to draft', detail = 'SQA_CHANGE_APPLICATION_NOT_DRAFT';
    end if;
    if v_application.content_locked_at is not null then
      raise exception using errcode = 'P0001', message = 'change application is locked after the first processed task', detail = 'SQA_CHANGE_CONTENT_LOCKED';
    end if;
    if exists (
      select 1
        from public.change_action_items existing_action
        join public.product_change_tasks existing_task
          on existing_task.action_item_id = existing_action.id
       where existing_action.change_application_id = v_application.id
         and existing_task.status = 'cancelled'
         and existing_task.cancel_kind is distinct from 'scope_removed'
    ) then
      raise exception using errcode = 'P0001', message = 'manually cancelled product change task cannot be reactivated', detail = 'SQA_CHANGE_MANUAL_CANCELLED_TASKS';
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
           published_at = case when p_publish
             then coalesce(v_application.published_at, clock_timestamp())
             else null
           end
     where id = v_application.id
     returning * into v_application;
  end if;
  v_application_id := v_application.id;

  select action_item.id
    into v_action_item_id
    from public.change_action_items action_item
   where action_item.change_application_id = v_application_id
   order by action_item.sort_order, action_item.id
   limit 1
   for update;

  if v_action_item_id is null then
    insert into public.change_action_items (
      change_application_id, kind, custom_kind_name, content, due_date, sort_order
    ) values (
      v_application_id, p_action_kind, v_custom_kind_name,
      v_action_content, p_due_date, 1
    )
    returning id into v_action_item_id;
  else
    update public.change_action_items
       set kind = p_action_kind,
           custom_kind_name = v_custom_kind_name,
           content = v_action_content,
           due_date = p_due_date
     where id = v_action_item_id;
  end if;

  -- Existing tasks are already locked by the parent helper. Iterate in ID
  -- order so status triggers and activity rows are deterministic.
  for v_removed_task in
    select task.*
      from public.product_change_tasks task
     where task.action_item_id = v_action_item_id
       and task.status = 'pending'
       and not exists (
         select 1
           from jsonb_array_elements(p_tasks) scope
          where (scope ->> 'product_id')::uuid = task.product_id
       )
     order by task.id
  loop
    update public.product_change_tasks
       set status = 'cancelled',
           cancel_kind = 'scope_removed',
           resolution_reason = '제품 적용 범위 편집에서 제외',
           proxy_reason = null,
           completed_by = null,
           completed_by_name = null,
           completed_at = null
     where id = v_removed_task.id;
    v_last_removed_task_id := v_removed_task.id;
  end loop;

  for v_scope in
    select (scope ->> 'product_id')::uuid as product_id,
           nullif(scope ->> 'assignee_id', '')::uuid as assignee_id,
           nullif(btrim(coalesce(scope ->> 'product_note', '')), '') as product_note
      from jsonb_array_elements(p_tasks) scope
     order by (scope ->> 'product_id')::uuid
  loop
    select product.name
      into v_product_name
      from public.products product
     where product.id = v_scope.product_id;
    if not found then
      raise exception using errcode = 'P0001', message = 'product not found', detail = 'SQA_CHANGE_PRODUCT_NOT_FOUND';
    end if;

    v_assignee_name := null;
    if v_scope.assignee_id is not null then
      select profile.name
        into v_assignee_name
        from public.profiles profile
       where profile.id = v_scope.assignee_id and profile.is_active;
      if not found then
        raise exception using errcode = '22023', message = 'assignee must be an active profile', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
      end if;
      if exists (
        select 1
          from public.product_assignments current_assignment
          join public.profiles current_profile
            on current_profile.id = current_assignment.user_id
         where current_assignment.product_id = v_scope.product_id
           and current_profile.is_active
      ) and not exists (
        select 1
          from public.product_assignments selected_assignment
          join public.profiles selected_profile
            on selected_profile.id = selected_assignment.user_id
         where selected_assignment.product_id = v_scope.product_id
           and selected_assignment.user_id = v_scope.assignee_id
           and selected_profile.is_active
      ) then
        raise exception using errcode = '22023', message = 'assignee must be a current product assignee', detail = 'SQA_CHANGE_PRODUCT_ASSIGNEE_REQUIRED';
      end if;
    elsif p_publish then
      raise exception using errcode = '22023', message = 'each published product requires one active assignee', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
    end if;

    v_existing_task := null;
    select task.*
      into v_existing_task
      from public.product_change_tasks task
     where task.action_item_id = v_action_item_id
       and task.product_id = v_scope.product_id;

    if not found then
      insert into public.product_change_tasks (
        action_item_id, product_id, product_name,
        assignee_id, assignee_name, product_note
      ) values (
        v_action_item_id, v_scope.product_id, v_product_name,
        v_scope.assignee_id, v_assignee_name, v_scope.product_note
      );
    else
      if v_existing_task.status = 'cancelled' then
        if v_existing_task.cancel_kind = 'scope_removed' then
          raise exception using errcode = 'P0001', message = 'scope removed product task must be restored with a reason first', detail = 'SQA_CHANGE_TASK_NOT_RESTORABLE';
        end if;
        raise exception using errcode = 'P0001', message = 'manually cancelled product change task cannot be reactivated', detail = 'SQA_CHANGE_MANUAL_CANCELLED_TASKS';
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
       where id = v_existing_task.id;
    end if;
  end loop;

  if p_publish and v_last_removed_task_id is not null then
    perform private.record_change_application_final_review_readiness(
      v_application_id,
      v_last_removed_task_id
    );
  end if;

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
    coalesce(v_actor_name, '파트장') || '님이 ' || v_change_number || ' 변경 적용업무를 '
      || case when p_publish then '등록했습니다.' else '초안으로 저장했습니다.' end,
    jsonb_build_object(
      'status', case when p_publish then 'published' else 'draft' end,
      'task_count', v_task_count
    )
  );

  return v_application_id;
end;
$$;

revoke all on function private.persist_change_application(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb, boolean
) from public, anon, authenticated;

-- Existing public signatures remain stable for the current client, but only an
-- active leader may author or publish. Drafts may retain an empty assignee;
-- publish requires exactly one unique, active assignee per product task.
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  return private.persist_change_application(
    p_change_application_id, p_expected_updated_at, p_change_number, p_source, p_title, p_summary,
    p_source_url, p_effective_date, p_action_kind, p_custom_kind_name,
    p_action_content, p_due_date, p_tasks, false
  );
end;
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
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_tasks is null or jsonb_typeof(p_tasks) <> 'array' or jsonb_array_length(p_tasks) = 0 then
    raise exception using errcode = '22023', message = 'at least one product task is required', detail = 'SQA_CHANGE_TASK_REQUIRED';
  end if;
  if exists (
    select 1
      from jsonb_array_elements(p_tasks) scope
      left join public.profiles assignee
        on assignee.id = nullif(scope ->> 'assignee_id', '')::uuid
       and assignee.is_active
     where nullif(scope ->> 'product_id', '') is null
        or nullif(scope ->> 'assignee_id', '') is null
        or assignee.id is null
  ) then
    raise exception using errcode = '22023', message = 'each published product requires one active assignee', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
  end if;
  return private.persist_change_application(
    p_change_application_id, p_expected_updated_at, p_change_number, p_source, p_title, p_summary,
    p_source_url, p_effective_date, p_action_kind, p_custom_kind_name,
    p_action_content, p_due_date, p_tasks, true
  );
end;
$$;

revoke all on function public.save_change_application_draft(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) from public, anon, authenticated;
revoke all on function public.publish_change_application(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) from public, anon, authenticated;
grant execute on function public.save_change_application_draft(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) to authenticated;
grant execute on function public.publish_change_application(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) to authenticated;

-- Product decisions belong only to the designated active assignee. Proxy
-- parameters are retained for wire compatibility but any proxy request fails.
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
  v_task public.product_change_tasks%rowtype;
  v_application public.change_applications%rowtype;
  v_application_id uuid;
  v_completion_note text := nullif(btrim(coalesce(p_completion_note, '')), '');
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_proxy_reason, '')), '') is not null then
    raise exception using errcode = 'P0001', message = 'proxy completion is not allowed', detail = 'SQA_CHANGE_PROXY_COMPLETION_FORBIDDEN';
  end if;
  if v_completion_note is not null and char_length(v_completion_note) > 2000 then
    raise exception using errcode = '22023', message = 'completion note is invalid', detail = 'SQA_CHANGE_COMPLETION_NOTE_INVALID';
  end if;

  v_application_id := private.require_change_application_id_for_task(p_task_id);
  v_application := private.lock_change_application_and_tasks(v_application_id);
  select task.* into v_task
    from public.product_change_tasks task
   where task.id = p_task_id;
  if v_application.status <> 'published' or v_application.archived_at is not null or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'change application is not active', detail = 'SQA_CHANGE_APPLICATION_NOT_ACTIVE';
  end if;
  if v_task.status <> 'pending' then raise exception using errcode = 'P0001', message = 'product change task is not pending', detail = 'SQA_CHANGE_TASK_NOT_PENDING'; end if;
  if v_task.assignee_id is distinct from v_actor_id
     or not exists (select 1 from public.profiles profile where profile.id = v_actor_id and profile.is_active) then
    raise exception using errcode = 'P0001', message = 'designated active assignee required', detail = 'SQA_CHANGE_ASSIGNEE_REQUIRED';
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', coalesce(v_completion_note, '제품 적용 완료'), true);
  perform set_config('sqa.audit_source', 'complete_product_change_task', true);
  update public.product_change_tasks
     set status = 'completed', completion_note = v_completion_note,
         resolution_reason = null, proxy_reason = null,
         completed_by = v_actor_id, completed_by_name = v_actor_name,
         completed_at = clock_timestamp()
   where id = p_task_id;
  update public.change_applications
     set content_locked_at = coalesce(content_locked_at, clock_timestamp())
   where id = v_application.id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor_id, v_actor_id, 'product_change_task', p_task_id, 'completed',
    coalesce(v_actor_name, '담당자') || '님이 ' || v_task.product_name || ' 변경 적용을 완료했습니다.',
    jsonb_build_object('change_title', v_application.title, 'completion_note', v_completion_note)
  );
  perform private.record_change_application_final_review_readiness(
    v_application.id,
    p_task_id
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
  v_task public.product_change_tasks%rowtype;
  v_application public.change_applications%rowtype;
  v_application_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_proxy_reason, '')), '') is not null then
    raise exception using errcode = 'P0001', message = 'proxy completion is not allowed', detail = 'SQA_CHANGE_PROXY_COMPLETION_FORBIDDEN';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'not applicable reason is required', detail = 'SQA_CHANGE_NOT_APPLICABLE_REASON_REQUIRED';
  end if;
  v_application_id := private.require_change_application_id_for_task(p_task_id);
  v_application := private.lock_change_application_and_tasks(v_application_id);
  select task.* into v_task
    from public.product_change_tasks task
   where task.id = p_task_id;
  if v_application.status <> 'published' or v_application.archived_at is not null or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'change application is not active', detail = 'SQA_CHANGE_APPLICATION_NOT_ACTIVE';
  end if;
  if v_task.status <> 'pending' then raise exception using errcode = 'P0001', message = 'product change task is not pending', detail = 'SQA_CHANGE_TASK_NOT_PENDING'; end if;
  if v_task.assignee_id is distinct from v_actor_id
     or not exists (select 1 from public.profiles profile where profile.id = v_actor_id and profile.is_active) then
    raise exception using errcode = 'P0001', message = 'designated active assignee required', detail = 'SQA_CHANGE_ASSIGNEE_REQUIRED';
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'mark_product_change_task_not_applicable', true);
  update public.product_change_tasks
     set status = 'not_applicable', completion_note = null,
         resolution_reason = v_reason, proxy_reason = null,
         completed_by = v_actor_id, completed_by_name = v_actor_name,
         completed_at = clock_timestamp()
   where id = p_task_id;
  update public.change_applications
     set content_locked_at = coalesce(content_locked_at, clock_timestamp())
   where id = v_application.id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor_id, v_actor_id, 'product_change_task', p_task_id, 'not_applicable',
    coalesce(v_actor_name, '담당자') || '님이 ' || v_task.product_name || ' 변경 적용을 해당 없음으로 처리했습니다.',
    jsonb_build_object('change_title', v_application.title, 'reason', v_reason)
  );
  perform private.record_change_application_final_review_readiness(
    v_application.id,
    p_task_id
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
  v_task public.product_change_tasks%rowtype;
  v_application public.change_applications%rowtype;
  v_application_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'reopen reason is required', detail = 'SQA_CHANGE_REOPEN_REASON_REQUIRED';
  end if;
  v_application_id := private.require_change_application_id_for_task(p_task_id);
  v_application := private.lock_change_application_and_tasks(v_application_id);
  select task.* into v_task
    from public.product_change_tasks task
   where task.id = p_task_id;
  if v_application.status <> 'published' or v_application.archived_at is not null or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'finalized change requires completion undo', detail = 'SQA_CHANGE_FINAL_UNDO_REQUIRED';
  end if;
  if v_task.status not in ('completed', 'not_applicable') then
    raise exception using errcode = 'P0001', message = 'product change task cannot be reopened', detail = 'SQA_CHANGE_TASK_NOT_REOPENABLE';
  end if;
  if v_task.assignee_id is distinct from v_actor_id
     or not exists (select 1 from public.profiles profile where profile.id = v_actor_id and profile.is_active) then
    raise exception using errcode = 'P0001', message = 'designated active assignee required', detail = 'SQA_CHANGE_ASSIGNEE_REQUIRED';
  end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'reopen_product_change_task', true);
  update public.product_change_tasks
     set status = 'pending', completion_note = null, resolution_reason = null,
         proxy_reason = null, completed_by = null, completed_by_name = null,
         completed_at = null, reopened_by = v_actor_id,
         reopened_by_name = v_actor_name, reopened_at = clock_timestamp(),
         reopen_reason = v_reason
   where id = p_task_id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor_id, v_actor_id, 'product_change_task', p_task_id, 'reopened',
    coalesce(v_actor_name, '담당자') || '님이 ' || v_task.product_name || ' 변경 적용업무를 다시 열었습니다.',
    jsonb_build_object('previous_status', v_task.status, 'reason', v_reason)
  );
end;
$$;

revoke all on function public.complete_product_change_task(uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_product_change_task_not_applicable(uuid, text, text) from public, anon, authenticated;
revoke all on function public.reopen_product_change_task(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_product_change_task(uuid, text, text) to authenticated;
grant execute on function public.mark_product_change_task_not_applicable(uuid, text, text) to authenticated;
grant execute on function public.reopen_product_change_task(uuid, text) to authenticated;

-- Reassignment keeps every published task owned by exactly one active person.
-- Parent applications and child tasks are locked in a deterministic order so
-- bulk reassignment cannot deadlock final completion or task processing.
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
  v_task_ids uuid[];
  v_application_ids uuid[];
  v_application_id uuid;
  v_readiness_task_id uuid;
  v_found_count integer;
  v_task record;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if p_task_ids is null or cardinality(p_task_ids) = 0
     or array_position(p_task_ids, null) is not null then
    raise exception using errcode = '22023', message = 'task ids are required', detail = 'SQA_CHANGE_TASK_IDS_REQUIRED';
  end if;
  if p_assignee_id is null then
    raise exception using errcode = '22023', message = 'active assignee is required', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'reassignment reason is required', detail = 'SQA_CHANGE_REASSIGN_REASON_REQUIRED';
  end if;

  select profile.name into v_assignee_name
    from public.profiles profile
   where profile.id = p_assignee_id and profile.is_active;
  if not found then
    raise exception using errcode = '22023', message = 'assignee must be active', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
  end if;
  select profile.name into v_actor_name from public.profiles profile where profile.id = v_actor_id;
  select array_agg(candidate.id order by candidate.id)
    into v_task_ids
    from (select distinct unnest(p_task_ids) as id) candidate;
  select count(*)::integer into v_found_count
    from public.product_change_tasks task
   where task.id = any(v_task_ids);
  if v_found_count <> cardinality(v_task_ids) then
    raise exception using errcode = 'P0001', message = 'product change task not found', detail = 'SQA_CHANGE_TASK_NOT_FOUND';
  end if;
  select array_agg(distinct action_item.change_application_id order by action_item.change_application_id)
    into v_application_ids
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
   where task.id = any(v_task_ids);

  foreach v_application_id in array v_application_ids loop
    perform private.lock_change_application_and_tasks(v_application_id);
  end loop;

  if exists (
    select 1
      from public.product_change_tasks task
      join public.change_action_items action_item on action_item.id = task.action_item_id
      join public.change_applications application on application.id = action_item.change_application_id
      left join public.profiles current_assignee
        on current_assignee.id = task.assignee_id and current_assignee.is_active
     where task.id = any(v_task_ids)
       and (
         task.status not in ('pending', 'completed', 'not_applicable')
         or application.status <> 'published'
         or application.archived_at is not null
         or application.final_completed_at is not null
         or (
           task.status in ('completed', 'not_applicable')
           and current_assignee.id is not null
         )
       )
  ) then
    raise exception using errcode = 'P0001', message = 'task cannot be reassigned in its current state', detail = 'SQA_CHANGE_TASK_NOT_REASSIGNABLE';
  end if;

  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'reassign_product_change_tasks', true);
  for v_task in
    select task.id, task.assignee_id, task.product_name
      from public.product_change_tasks task
     where task.id = any(v_task_ids)
     order by task.id
  loop
    update public.product_change_tasks
       set assignee_id = p_assignee_id, assignee_name = v_assignee_name
     where id = v_task.id;
    insert into public.activity_logs (
      actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
    ) values (
      v_actor_id, p_assignee_id, 'product_change_task', v_task.id, 'reassigned',
      coalesce(v_actor_name, '파트장') || '님이 ' || v_task.product_name || ' 변경 적용 책임자를 변경했습니다.',
      jsonb_build_object(
        'from_assignee_id', v_task.assignee_id,
        'to_assignee_id', p_assignee_id,
        'reason', v_reason
      )
    );
  end loop;

  foreach v_application_id in array v_application_ids loop
    select task.id
      into v_readiness_task_id
      from public.product_change_tasks task
      join public.change_action_items action_item on action_item.id = task.action_item_id
     where task.id = any(v_task_ids)
       and action_item.change_application_id = v_application_id
     order by task.id
     limit 1;
    perform private.record_change_application_final_review_readiness(
      v_application_id,
      v_readiness_task_id
    );
  end loop;
end;
$$;

revoke all on function public.reassign_product_change_tasks(uuid[], uuid, text)
  from public, anon, authenticated;
grant execute on function public.reassign_product_change_tasks(uuid[], uuid, text)
  to authenticated;

-- Scope and cancellation management are leader-only. Scope removal remains a
-- cancelled row with cancel_kind=scope_removed so existing history is stable.
create or replace function public.remove_product_from_change_scope(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_task public.product_change_tasks%rowtype;
  v_application public.change_applications%rowtype;
  v_application_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'scope removal reason is required', detail = 'SQA_SCOPE_REMOVAL_REASON_REQUIRED';
  end if;
  v_application_id := private.require_change_application_id_for_task(p_task_id);
  v_application := private.lock_change_application_and_tasks(v_application_id);
  if v_application.status not in ('draft', 'published')
     or v_application.archived_at is not null
     or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'change application is not active', detail = 'SQA_CHANGE_APPLICATION_NOT_ACTIVE';
  end if;
  select task.* into v_task from public.product_change_tasks task
   where task.id = p_task_id;
  if v_task.status <> 'pending' then raise exception using errcode = 'P0001', message = 'only pending tasks can leave scope', detail = 'SQA_SCOPE_TASK_NOT_PENDING'; end if;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'remove_product_from_change_scope', true);
  update public.product_change_tasks
     set status = 'cancelled', cancel_kind = 'scope_removed', resolution_reason = v_reason,
         completed_by = null, completed_by_name = null, completed_at = null, proxy_reason = null
   where id = p_task_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'product_change_task', p_task_id, 'scope_removed',
          v_task.product_name || ' 제품을 변경 적용범위에서 제외했습니다.', jsonb_build_object('reason', v_reason));
  perform private.record_change_application_final_review_readiness(
    v_application.id,
    p_task_id
  );
end;
$$;

create or replace function public.restore_product_change_scope(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_task public.product_change_tasks%rowtype;
  v_application public.change_applications%rowtype;
  v_application_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'scope restore reason is required', detail = 'SQA_SCOPE_RESTORE_REASON_REQUIRED';
  end if;
  v_application_id := private.require_change_application_id_for_task(p_task_id);
  v_application := private.lock_change_application_and_tasks(v_application_id);
  if v_application.status not in ('draft', 'published')
     or v_application.archived_at is not null
     or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'change application is not active', detail = 'SQA_CHANGE_APPLICATION_NOT_ACTIVE';
  end if;
  if v_application.content_locked_at is not null then
    raise exception using errcode = 'P0001', message = 'change application is locked after processing started', detail = 'SQA_CHANGE_CONTENT_LOCKED';
  end if;
  select task.* into v_task from public.product_change_tasks task
   where task.id = p_task_id;
  if v_task.status <> 'cancelled' or v_task.cancel_kind <> 'scope_removed' then
    raise exception using errcode = 'P0001', message = 'task is not scope removed', detail = 'SQA_CHANGE_TASK_NOT_RESTORABLE';
  end if;
  if not exists (select 1 from public.profiles profile where profile.id = v_task.assignee_id and profile.is_active) then
    raise exception using errcode = 'P0001', message = 'active assignee required before scope restore', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
  end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'restore_product_change_scope', true);
  update public.product_change_tasks
     set status = 'pending', restore_reason = v_reason, resolution_reason = null,
         proxy_reason = null, completed_by = null, completed_by_name = null,
         completed_at = null, reopened_by = v_actor_id, reopened_by_name = v_actor_name,
         reopened_at = clock_timestamp(), reopen_reason = v_reason
   where id = p_task_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'product_change_task', p_task_id, 'scope_restored',
          v_task.product_name || ' 제품을 변경 적용범위에 복원했습니다.', jsonb_build_object('reason', v_reason));
end;
$$;

create or replace function public.cancel_product_change_task(p_task_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_task public.product_change_tasks%rowtype;
  v_application public.change_applications%rowtype;
  v_application_id uuid;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'cancellation reason is required', detail = 'SQA_CHANGE_CANCELLATION_REASON_REQUIRED';
  end if;
  v_application_id := private.require_change_application_id_for_task(p_task_id);
  v_application := private.lock_change_application_and_tasks(v_application_id);
  if v_application.archived_at is not null or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'change application is not active', detail = 'SQA_CHANGE_APPLICATION_NOT_ACTIVE';
  end if;
  select task.* into v_task from public.product_change_tasks task
   where task.id = p_task_id;
  if v_task.status <> 'pending' then raise exception using errcode = 'P0001', message = 'only pending tasks can be cancelled', detail = 'SQA_CHANGE_TASK_NOT_PENDING'; end if;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'cancel_product_change_task', true);
  update public.product_change_tasks
     set status = 'cancelled', cancel_kind = 'manual', resolution_reason = v_reason
   where id = p_task_id;
  insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, v_task.assignee_id, 'product_change_task', p_task_id, 'cancelled',
          v_task.product_name || ' 변경 적용업무를 취소했습니다.', jsonb_build_object('reason', v_reason));
end;
$$;

create or replace function public.cancel_change_application(p_change_application_id uuid, p_reason text)
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
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'cancellation reason is required', detail = 'SQA_CHANGE_CANCELLATION_REASON_REQUIRED';
  end if;
  v_application := private.lock_change_application_and_tasks(p_change_application_id);
  if v_application.status = 'cancelled' then raise exception using errcode = 'P0001', message = 'change application is already cancelled', detail = 'SQA_CHANGE_APPLICATION_CANCELLED'; end if;
  if v_application.archived_at is not null or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'finalized change must be undone before cancellation', detail = 'SQA_CHANGE_FINAL_UNDO_REQUIRED';
  end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'cancel_change_application', true);
  update public.product_change_tasks task
     set status = 'cancelled', cancel_kind = 'application_cancelled', resolution_reason = v_reason
    from public.change_action_items action_item
   where action_item.id = task.action_item_id
     and action_item.change_application_id = v_application.id
     and task.status = 'pending';
  update public.change_applications
     set status = 'cancelled', cancelled_at = clock_timestamp(), cancellation_reason = v_reason
   where id = v_application.id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'change_application', v_application.id, 'cancelled',
          coalesce(v_actor_name, '파트장') || '님이 ' || v_application.change_number || ' 변경건을 취소했습니다.',
          jsonb_build_object('reason', v_reason));
end;
$$;

revoke all on function public.remove_product_from_change_scope(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_product_change_scope(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_product_change_task(uuid, text) from public, anon, authenticated;
revoke all on function public.cancel_change_application(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_product_from_change_scope(uuid, text) to authenticated;
grant execute on function public.restore_product_change_scope(uuid, text) to authenticated;
grant execute on function public.cancel_product_change_task(uuid, text) to authenticated;
grant execute on function public.cancel_change_application(uuid, text) to authenticated;

-- Product assignment transfer follows the same parent-before-child lock order
-- as every change-application mutation and skips finalized applications.
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
  v_application_ids uuid[];
  v_application_id uuid;
  v_task record;
  v_transferred integer := 0;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if coalesce(p_transfer_pending, false) and (v_reason is null or char_length(v_reason) > 2000) then
    raise exception using errcode = '22023', message = 'transfer reason is required', detail = 'SQA_CHANGE_REASSIGN_REASON_REQUIRED';
  end if;
  perform public.require_profile_role(p_user_id, 'member', 'product_assignments.user_id');
  select profile.name into v_assignee_name from public.profiles profile
   where profile.id = p_user_id and profile.is_active;
  if not found then
    raise exception using errcode = '22023', message = 'product assignee must be active', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
  end if;
  select product.name into v_product_name from public.products product where product.id = p_product_id;
  if not found then raise exception using errcode = 'P0001', message = 'product not found', detail = 'SQA_PRODUCT_NOT_FOUND'; end if;
  select profile.name into v_actor_name from public.profiles profile where profile.id = v_actor_id;

  if coalesce(p_transfer_pending, false) then
    select array_agg(distinct application.id order by application.id)
      into v_application_ids
      from public.product_change_tasks task
      join public.change_action_items action_item on action_item.id = task.action_item_id
      join public.change_applications application on application.id = action_item.change_application_id
     where task.product_id = p_product_id
       and task.status = 'pending'
       and task.assignee_id is distinct from p_user_id
       and application.status = 'published'
       and application.archived_at is null
       and application.final_completed_at is null;
    if v_application_ids is not null then
      foreach v_application_id in array v_application_ids loop
        perform private.lock_change_application_and_tasks(v_application_id);
      end loop;
    end if;
  end if;

  select product.name into v_product_name from public.products product
   where product.id = p_product_id for update;
  if not found then raise exception using errcode = 'P0001', message = 'product not found', detail = 'SQA_PRODUCT_NOT_FOUND'; end if;

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

  if coalesce(p_transfer_pending, false) and v_application_ids is not null then
    perform set_config('sqa.audit_reason', v_reason, true);
    perform set_config('sqa.audit_source', 'assign_product_and_transfer_change_tasks', true);
    for v_task in
      select task.id, task.assignee_id, task.product_name
        from public.product_change_tasks task
        join public.change_action_items action_item on action_item.id = task.action_item_id
        join public.change_applications application on application.id = action_item.change_application_id
       where task.product_id = p_product_id
         and task.status = 'pending'
         and task.assignee_id is distinct from p_user_id
         and application.id = any(v_application_ids)
         and application.status = 'published'
         and application.archived_at is null
         and application.final_completed_at is null
       order by task.id
    loop
      update public.product_change_tasks
         set assignee_id = p_user_id, assignee_name = v_assignee_name
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

revoke all on function public.assign_product_and_transfer_change_tasks(uuid, uuid, boolean, text)
  from public, anon, authenticated;
grant execute on function public.assign_product_and_transfer_change_tasks(uuid, uuid, boolean, text)
  to authenticated;

-- Manual archive remains only for cancelled legacy workflow records. Published
-- changes must use explicit final completion, preventing an archive bypass.
create or replace function public.archive_change_application(p_change_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application public.change_applications%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'archive reason is required'; end if;
  v_application := private.lock_change_application_and_tasks(p_change_application_id);
  if v_application.status <> 'cancelled' or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'published changes require final completion', detail = 'SQA_CHANGE_FINAL_COMPLETION_REQUIRED';
  end if;
  if v_application.archived_at is not null then raise exception 'change application is already archived'; end if;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'archive_change_application', true);
  update public.change_applications
     set archived_at = clock_timestamp(), archived_by = v_actor_id, archive_reason = v_reason
   where id = v_application.id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'change_application', v_application.id, 'archived',
          v_application.change_number || ' 취소 변경건을 보관했습니다.', jsonb_build_object('reason', v_reason));
end;
$$;

create or replace function public.restore_change_application(p_change_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_application public.change_applications%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'restore reason is required'; end if;
  v_application := private.lock_change_application_and_tasks(p_change_application_id);
  if v_application.archived_at is null then raise exception 'change application is not archived'; end if;
  if v_application.final_completed_at is not null or v_application.archive_origin = 'automatic' then
    raise exception using errcode = 'P0001', message = 'completion history cannot be restored directly', detail = 'SQA_CHANGE_FINAL_UNDO_REQUIRED';
  end if;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'restore_change_application', true);
  update public.change_applications
     set archived_at = null, archived_by = null, archive_reason = null
   where id = v_application.id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'change_application', v_application.id, 'restored',
          v_application.change_number || ' 취소 변경건을 보관함에서 복원했습니다.',
          jsonb_build_object('reason', v_reason, 'previous_archived_at', v_application.archived_at));
end;
$$;

revoke all on function public.archive_change_application(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_change_application(uuid, text) from public, anon, authenticated;
grant execute on function public.archive_change_application(uuid, text) to authenticated;
grant execute on function public.restore_change_application(uuid, text) to authenticated;

-- Explicit final completion serializes the application and all product tasks,
-- checks OCC after locking, and writes final and archive fields atomically.
create or replace function public.complete_change_application(
  p_change_application_id uuid,
  p_expected_updated_at timestamptz,
  p_note text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_application public.change_applications%rowtype;
  v_note text := nullif(btrim(coalesce(p_note, '')), '');
  v_now timestamptz := clock_timestamp();
  v_total integer;
  v_pending integer;
  v_unassigned integer;
  v_manual_cancelled integer;
  v_completed integer;
  v_not_applicable integer;
  v_scope_removed integer;
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_note is not null and char_length(v_note) > 2000 then
    raise exception using errcode = '22023', message = 'final completion note is too long', detail = 'SQA_CHANGE_FINAL_NOTE_INVALID';
  end if;

  v_application := private.lock_change_application_and_tasks(p_change_application_id);
  if p_expected_updated_at is null or v_application.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'change application was modified by another user', detail = 'SQA_CHANGE_APPLICATION_CONFLICT';
  end if;
  if v_application.status <> 'published' then raise exception using errcode = 'P0001', message = 'change application is not published', detail = 'SQA_CHANGE_APPLICATION_NOT_PUBLISHED'; end if;
  if v_application.archived_at is not null or v_application.final_completed_at is not null then
    raise exception using errcode = 'P0001', message = 'change application is already finalized or archived', detail = 'SQA_CHANGE_APPLICATION_ALREADY_FINAL';
  end if;

  select
    count(*) filter (
      where not (task.status = 'cancelled' and task.cancel_kind = 'application_cancelled')
    )::integer,
    count(*) filter (
      where task.status = 'pending'
        and task.cancel_kind is distinct from 'application_cancelled'
    )::integer,
    count(*) filter (
      where not (task.status = 'cancelled' and task.cancel_kind = 'scope_removed')
        and not (task.status = 'cancelled' and task.cancel_kind = 'application_cancelled')
        and (task.assignee_id is null or assignee.id is null)
    )::integer,
    count(*) filter (
      where task.status = 'cancelled'
        and (task.cancel_kind is null or task.cancel_kind not in ('scope_removed', 'application_cancelled'))
    )::integer,
    count(*) filter (where task.status = 'completed')::integer,
    count(*) filter (where task.status = 'not_applicable')::integer,
    count(*) filter (where task.status = 'cancelled' and task.cancel_kind = 'scope_removed')::integer
    into v_total, v_pending, v_unassigned, v_manual_cancelled,
         v_completed, v_not_applicable, v_scope_removed
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    left join public.profiles assignee on assignee.id = task.assignee_id and assignee.is_active
   where action_item.change_application_id = v_application.id;

  if v_total = 0 then raise exception using errcode = 'P0001', message = 'change application has no product tasks', detail = 'SQA_CHANGE_TASK_REQUIRED'; end if;
  if v_pending > 0 then raise exception using errcode = 'P0001', message = 'change application has pending product tasks', detail = 'SQA_CHANGE_PENDING_TASKS'; end if;
  if v_unassigned > 0 then raise exception using errcode = 'P0001', message = 'change application has unassigned or inactive assignees', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED'; end if;
  if v_manual_cancelled > 0 then raise exception using errcode = 'P0001', message = 'change application has unresolved cancelled tasks', detail = 'SQA_CHANGE_MANUAL_CANCELLED_TASKS'; end if;
  if v_completed + v_not_applicable + v_scope_removed <> v_total then
    raise exception using errcode = 'P0001', message = 'change application has invalid terminal tasks', detail = 'SQA_CHANGE_TERMINAL_STATE_INVALID';
  end if;
  if (v_not_applicable > 0 or v_scope_removed > 0) and v_note is null then
    raise exception using errcode = '22023', message = 'final completion note is required for exceptions', detail = 'SQA_CHANGE_FINAL_NOTE_REQUIRED';
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', coalesce(v_note, '공통변경 최종 완료'), true);
  perform set_config('sqa.audit_source', 'complete_change_application', true);
  update public.change_applications
     set final_completed_at = v_now,
         final_completed_by = v_actor_id,
         final_completed_by_name = v_actor_name,
         final_completion_note = v_note,
         archived_at = v_now,
         archived_by = v_actor_id,
         archive_reason = '파트장 최종 확인 완료'
   where id = v_application.id;

  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor_id, 'change_application', v_application.id, 'final_completed',
    coalesce(v_actor_name, '파트장') || '님이 ' || v_application.change_number || ' 공통변경을 최종 완료했습니다.',
    jsonb_build_object(
      'note', v_note, 'total_count', v_total, 'completed_count', v_completed,
      'not_applicable_count', v_not_applicable, 'scope_removed_count', v_scope_removed
    )
  );
  return v_now;
end;
$$;

-- p_reopen_tasks is a non-empty array of
-- {"task_id":"uuid","assignee_id":"uuid"}. Every selected task is reopened
-- with the explicitly selected active assignee.
create or replace function public.undo_change_application_completion(
  p_change_application_id uuid,
  p_expected_updated_at timestamptz,
  p_reason text,
  p_reopen_tasks jsonb
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_application public.change_applications%rowtype;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_reopen_tasks jsonb := coalesce(p_reopen_tasks, '[]'::jsonb);
  v_task public.product_change_tasks%rowtype;
  v_new_assignee_id uuid;
  v_new_assignee_name text;
  v_expected_count integer;
  v_found_count integer;
  v_now timestamptz := clock_timestamp();
begin
  if v_actor_id is null or not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  if v_reason is null or char_length(v_reason) > 2000 then
    raise exception using errcode = '22023', message = 'completion undo reason is required', detail = 'SQA_CHANGE_UNDO_REASON_REQUIRED';
  end if;
  if jsonb_typeof(v_reopen_tasks) <> 'array' or jsonb_array_length(v_reopen_tasks) = 0 then
    raise exception using errcode = '22023', message = 'reopen tasks are required', detail = 'SQA_CHANGE_REOPEN_TASKS_INVALID';
  end if;
  begin
    if exists (
      select 1
        from jsonb_array_elements(v_reopen_tasks) reopen_task
       where nullif(reopen_task ->> 'task_id', '') is null
          or nullif(reopen_task ->> 'assignee_id', '') is null
    ) or (
      select count(*) <> count(distinct reopen_task ->> 'task_id')
        from jsonb_array_elements(v_reopen_tasks) reopen_task
    ) then
      raise exception using errcode = '22023', message = 'reopen task ids must be unique', detail = 'SQA_CHANGE_REOPEN_TASKS_INVALID';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(v_reopen_tasks) reopen_task
        left join public.profiles assignee
          on assignee.id = (reopen_task ->> 'assignee_id')::uuid
         and assignee.is_active
       where assignee.id is null
    ) then
      raise exception using errcode = '22023', message = 'every reopened task requires an active assignee', detail = 'SQA_CHANGE_ACTIVE_ASSIGNEE_REQUIRED';
    end if;
  exception
    when invalid_text_representation then
      raise exception using errcode = '22023', message = 'reopen task ids and assignee ids must be UUIDs', detail = 'SQA_CHANGE_REOPEN_TASKS_INVALID';
  end;
  v_expected_count := jsonb_array_length(v_reopen_tasks);

  v_application := private.lock_change_application_and_tasks(p_change_application_id);
  if p_expected_updated_at is null or v_application.updated_at is distinct from p_expected_updated_at then
    raise exception using errcode = 'P0001', message = 'change application was modified by another user', detail = 'SQA_CHANGE_APPLICATION_CONFLICT';
  end if;
  if v_application.status <> 'published' or v_application.final_completed_at is null or v_application.archived_at is null then
    raise exception using errcode = 'P0001', message = 'change application is not explicitly finalized', detail = 'SQA_CHANGE_APPLICATION_NOT_FINAL';
  end if;

  select count(*)::integer
    into v_found_count
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join jsonb_array_elements(v_reopen_tasks) reopen_task
      on (reopen_task ->> 'task_id')::uuid = task.id
   where action_item.change_application_id = v_application.id
     and (
       task.status in ('completed', 'not_applicable')
       or (task.status = 'cancelled' and task.cancel_kind = 'scope_removed')
     );
  if v_found_count <> v_expected_count then
    raise exception using errcode = 'P0001', message = 'reopen task is missing or not terminal', detail = 'SQA_CHANGE_TASK_NOT_REOPENABLE';
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', v_reason, true);
  perform set_config('sqa.audit_source', 'undo_change_application_completion', true);
  update public.change_applications
     set final_completed_at = null, final_completed_by = null,
         final_completed_by_name = null, final_completion_note = null,
         archived_at = null, archived_by = null, archive_reason = null
   where id = v_application.id;

  for v_task in
    select task.*
      from public.product_change_tasks task
      join public.change_action_items action_item on action_item.id = task.action_item_id
      join jsonb_array_elements(v_reopen_tasks) reopen_task
        on (reopen_task ->> 'task_id')::uuid = task.id
     where action_item.change_application_id = v_application.id
     order by task.id
  loop
    select (reopen_task ->> 'assignee_id')::uuid
      into v_new_assignee_id
      from jsonb_array_elements(v_reopen_tasks) reopen_task
     where (reopen_task ->> 'task_id')::uuid = v_task.id;
    select profile.name into v_new_assignee_name
      from public.profiles profile
     where profile.id = v_new_assignee_id and profile.is_active;
    update public.product_change_tasks
       set status = 'pending', assignee_id = v_new_assignee_id, assignee_name = v_new_assignee_name,
           completion_note = null, resolution_reason = null, proxy_reason = null,
           completed_by = null, completed_by_name = null, completed_at = null,
           cancel_kind = null, cancelled_at = null, cancelled_by = null,
           restore_reason = case when v_task.status = 'cancelled' then v_reason else restore_reason end,
           reopened_by = v_actor_id, reopened_by_name = v_actor_name,
           reopened_at = v_now, reopen_reason = v_reason
     where id = v_task.id;
    insert into public.activity_logs (actor_id, target_user_id, entity_type, entity_id, action, summary, metadata)
    values (
      v_actor_id, v_new_assignee_id, 'product_change_task', v_task.id, 'reopened_by_final_undo',
      v_task.product_name || ' 변경 적용업무를 최종 완료 취소로 다시 열었습니다.',
      jsonb_build_object('previous_status', v_task.status, 'reason', v_reason, 'assignee_id', v_new_assignee_id)
    );
  end loop;

  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (
    v_actor_id, 'change_application', v_application.id, 'final_completion_undone',
    coalesce(v_actor_name, '파트장') || '님이 ' || v_application.change_number || ' 공통변경 완료를 취소했습니다.',
    jsonb_build_object(
      'reason', v_reason, 'reopen_tasks', v_reopen_tasks,
      'previous_final_completed_at', v_application.final_completed_at
    )
  );
  return v_now;
end;
$$;

revoke all on function public.complete_change_application(uuid, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.undo_change_application_completion(uuid, timestamptz, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_change_application(uuid, timestamptz, text)
  to authenticated;
grant execute on function public.undo_change_application_completion(uuid, timestamptz, text, jsonb)
  to authenticated;

-- v3 keeps the complete v2 envelope and adds final fields plus authoritative
-- per-application aggregates. v2 is intentionally unchanged for old clients.
create or replace function public.get_change_bootstrap_v3()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_leader boolean;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  v_is_leader := public.is_active_leader();

  return (
    with base as materialized (
      select public.get_change_bootstrap_v2() as payload
    ),
    base_application_rows as materialized (
      select entry.value, entry.ordinality as bootstrap_ordinal
        from base
        cross join lateral jsonb_array_elements(
          base.payload #> '{data,change_applications}'
        ) with ordinality as entry(value, ordinality)
    ),
    visible_applications as materialized (
      select application.*, entry.bootstrap_ordinal
        from base_application_rows entry
        join public.change_applications application
          on application.id = (entry.value ->> 'id')::uuid
    ),
    counts as materialized (
      select
        application.id,
        count(task.id) filter (
          where not (task.status = 'cancelled' and task.cancel_kind = 'application_cancelled')
        )::integer as total_count,
        count(task.id) filter (
          where task.status = 'pending'
            and task.cancel_kind is distinct from 'application_cancelled'
        )::integer as pending_count,
        count(task.id) filter (where task.status = 'completed')::integer as completed_count,
        count(task.id) filter (where task.status = 'not_applicable')::integer as not_applicable_count,
        count(task.id) filter (where task.status = 'cancelled' and task.cancel_kind = 'scope_removed')::integer as scope_removed_count,
        count(task.id) filter (
          where task.status = 'cancelled'
            and (task.cancel_kind is null or task.cancel_kind not in ('scope_removed', 'application_cancelled'))
        )::integer as unresolved_cancelled_count,
        count(task.id) filter (
          where not (task.status = 'cancelled' and task.cancel_kind = 'scope_removed')
            and not (task.status = 'cancelled' and task.cancel_kind = 'application_cancelled')
            and (task.assignee_id is null or assignee.id is null)
        )::integer as unassigned_count
      from visible_applications application
      left join public.change_action_items action_item on action_item.change_application_id = application.id
      left join public.product_change_tasks task on task.action_item_id = action_item.id
      left join public.profiles assignee on assignee.id = task.assignee_id and assignee.is_active
      group by application.id
    ),
    patched_applications as (
      select coalesce(jsonb_agg(
        entry.value || jsonb_build_object(
          'final_completed_at', application.final_completed_at,
          'final_completed_by', application.final_completed_by,
          'final_completed_by_name', application.final_completed_by_name,
          'final_completion_note', application.final_completion_note
        ) order by entry.bootstrap_ordinal
      ), '[]'::jsonb) as rows
      from base_application_rows entry
      join visible_applications application on application.id = (entry.value ->> 'id')::uuid
    ),
    summaries as (
      select coalesce(jsonb_agg(jsonb_build_object(
        'change_application_id', application.id,
        'workflow_status', case
          when application.status = 'cancelled' then 'cancelled'
          when application.final_completed_at is not null then 'completed'
          when application.archived_at is not null then 'legacy_completed'
          when application.status = 'draft' then 'draft'
          when counts.total_count > 0 and counts.pending_count = 0
            and counts.unassigned_count = 0 and counts.unresolved_cancelled_count = 0
            and counts.completed_count + counts.not_applicable_count
              + counts.scope_removed_count = counts.total_count
            then 'final_review_ready'
          else 'in_progress'
        end,
        'total_count', counts.total_count,
        'pending_count', counts.pending_count,
        'completed_count', counts.completed_count,
        'not_applicable_count', counts.not_applicable_count,
        'scope_removed_count', counts.scope_removed_count,
        'unresolved_cancelled_count', counts.unresolved_cancelled_count,
        'unassigned_count', counts.unassigned_count,
        'processed_count', counts.completed_count + counts.not_applicable_count
          + counts.scope_removed_count,
        'percent', case when counts.total_count > 0
          then round((counts.completed_count + counts.not_applicable_count
            + counts.scope_removed_count) * 100.0 / counts.total_count)::integer
          else 0 end,
        'can_finalize', v_is_leader
          and application.status = 'published'
          and application.archived_at is null
          and application.final_completed_at is null
          and counts.total_count > 0
          and counts.pending_count = 0
          and counts.unassigned_count = 0
          and counts.unresolved_cancelled_count = 0
          and counts.completed_count + counts.not_applicable_count
            + counts.scope_removed_count = counts.total_count
      ) order by application.bootstrap_ordinal), '[]'::jsonb) as rows
      from visible_applications application
      join counts on counts.id = application.id
    )
    select jsonb_build_object(
      'schema_version', 3,
      'snapshot_at', base.payload -> 'snapshot_at',
      'data', (base.payload -> 'data') || jsonb_build_object(
        'change_applications', patched_applications.rows,
        'application_summaries', summaries.rows
      ),
      'warnings', coalesce(base.payload -> 'warnings', '[]'::jsonb)
    )
    from base, patched_applications, summaries
  );
end;
$$;

revoke all on function public.get_change_bootstrap_v3() from public, anon, authenticated;
grant execute on function public.get_change_bootstrap_v3() to authenticated;

-- Searchable permanent history. Leaders receive every product task; members
  -- receive only tasks they currently own, completed, or previously owned as
  -- proven by the private durable assignee ledger.
create or replace function public.list_change_application_history_v1(
  p_result text default null,
  p_query text default null,
  p_from date default null,
  p_to date default null,
  p_product_id uuid default null,
  p_assignee_id uuid default null,
  p_before_history_at timestamptz default null,
  p_before_id uuid default null,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_is_leader boolean;
  v_result text := nullif(btrim(coalesce(p_result, '')), '');
  v_query text := nullif(btrim(coalesce(p_query, '')), '');
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 100));
  v_snapshot timestamptz := clock_timestamp();
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  v_is_leader := public.is_active_leader();
  if v_result is not null and v_result not in (
    'completed', 'cancelled', 'legacy_auto', 'legacy_manual'
  ) then
    raise exception using errcode = '22023', message = 'invalid change history result', detail = 'SQA_CHANGE_HISTORY_RESULT_INVALID';
  end if;
  if v_query is not null and char_length(v_query) > 200 then
    raise exception using errcode = '22023', message = 'change history query is too long', detail = 'SQA_CHANGE_HISTORY_QUERY_TOO_LONG';
  end if;
  if p_from is not null and p_to is not null and p_from > p_to then
    raise exception using errcode = '22023', message = 'invalid change history date range', detail = 'SQA_CHANGE_HISTORY_DATE_INVALID';
  end if;
  if (p_before_history_at is null) <> (p_before_id is null) then
    raise exception using errcode = '22023', message = 'incomplete change history cursor', detail = 'SQA_CHANGE_HISTORY_CURSOR_INVALID';
  end if;
  if not v_is_leader and p_assignee_id is not null and p_assignee_id <> v_actor_id then
    return jsonb_build_object(
      'schema_version', 1, 'snapshot_at', v_snapshot, 'rows', '[]'::jsonb,
      'has_more', false, 'next_cursor', null
    );
  end if;

  return (
    with accessible_tasks as materialized (
      select task.*, action_item.change_application_id
        from public.product_change_tasks task
        join public.change_action_items action_item on action_item.id = task.action_item_id
       where v_is_leader
          or task.assignee_id = v_actor_id
          or task.completed_by = v_actor_id
          or exists (
            select 1
              from private.product_change_task_assignee_history history
             where history.task_id = task.id
               and history.assignee_id = v_actor_id
          )
    ),
    candidates as materialized (
      select
        application.*,
        case
          when application.status = 'cancelled' then application.cancelled_at
          else coalesce(application.final_completed_at, application.archived_at)
        end as history_at,
        case
          when application.final_completed_at is not null then 'completed'
          when application.status = 'cancelled' then 'cancelled'
          when application.archive_origin = 'automatic' then 'legacy_auto'
          else 'legacy_manual'
        end as history_result
      from public.change_applications application
      where (application.archived_at is not null or application.status = 'cancelled')
        and (v_is_leader or exists (
          select 1 from accessible_tasks task where task.change_application_id = application.id
        ))
    ),
    filtered as materialized (
      select candidate.*
        from candidates candidate
       where (v_result is null or candidate.history_result = v_result)
         and (p_from is null or candidate.history_at >= (p_from::timestamp at time zone 'Asia/Seoul'))
         and (p_to is null or candidate.history_at < ((p_to + 1)::timestamp at time zone 'Asia/Seoul'))
         and (p_before_history_at is null or (candidate.history_at, candidate.id) < (p_before_history_at, p_before_id))
         and (p_product_id is null or exists (
           select 1 from accessible_tasks task
            where task.change_application_id = candidate.id and task.product_id = p_product_id
         ))
         and (p_assignee_id is null or exists (
           select 1 from accessible_tasks task
            where task.change_application_id = candidate.id
              and (
                task.assignee_id = p_assignee_id
                or task.completed_by = p_assignee_id
                or exists (
                  select 1
                    from private.product_change_task_assignee_history history
                   where history.task_id = task.id
                     and history.assignee_id = p_assignee_id
                )
              )
         ))
         and (
           v_query is null
           or position(lower(v_query) in lower(candidate.change_number::text)) > 0
           or position(lower(v_query) in lower(candidate.title)) > 0
           or position(lower(v_query) in lower(candidate.summary)) > 0
           or exists (
             select 1 from accessible_tasks task
              where task.change_application_id = candidate.id
                and (
                  position(lower(v_query) in lower(task.product_name)) > 0
                  or position(lower(v_query) in lower(coalesce(task.assignee_name, ''))) > 0
                )
           )
         )
    ),
    bounded as materialized (
      select * from filtered order by history_at desc, id desc limit v_limit + 1
    ),
    page as materialized (
      select * from bounded order by history_at desc, id desc limit v_limit
    ),
    task_rows as (
      select task.change_application_id,
             jsonb_agg(to_jsonb(task) - 'change_application_id'
               order by task.product_name, task.id) as rows
        from accessible_tasks task
       where task.change_application_id in (select id from page)
       group by task.change_application_id
    ),
    application_counts as (
      select
        application.id,
        count(task.id) filter (
          where not (task.status = 'cancelled' and task.cancel_kind = 'application_cancelled')
        )::integer as total_count,
        count(task.id) filter (
          where task.status = 'pending'
            and task.cancel_kind is distinct from 'application_cancelled'
        )::integer as pending_count,
        count(task.id) filter (where task.status = 'completed')::integer as completed_count,
        count(task.id) filter (where task.status = 'not_applicable')::integer as not_applicable_count,
        count(task.id) filter (
          where task.status = 'cancelled' and task.cancel_kind = 'scope_removed'
        )::integer as scope_removed_count,
        count(task.id) filter (
          where task.status = 'cancelled'
            and (task.cancel_kind is null or task.cancel_kind not in ('scope_removed', 'application_cancelled'))
        )::integer as unresolved_cancelled_count,
        count(task.id) filter (
          where not (task.status = 'cancelled' and task.cancel_kind = 'scope_removed')
            and not (task.status = 'cancelled' and task.cancel_kind = 'application_cancelled')
            and (task.assignee_id is null or assignee.id is null)
        )::integer as unassigned_count
      from page application
      left join public.change_action_items action_item on action_item.change_application_id = application.id
      left join public.product_change_tasks task on task.action_item_id = action_item.id
      left join public.profiles assignee on assignee.id = task.assignee_id and assignee.is_active
      group by application.id
    ),
    response_rows as (
      select coalesce(jsonb_agg(
        (to_jsonb(application) - 'history_result' - 'history_at')
        || jsonb_build_object(
          'history_result', application.history_result,
          'history_at', application.history_at,
          'application_summary', jsonb_build_object(
            'change_application_id', application.id,
            'workflow_status', case
              when application.status = 'cancelled' then 'cancelled'
              when application.final_completed_at is not null then 'completed'
              else 'legacy_completed'
            end,
            'total_count', counts.total_count,
            'pending_count', counts.pending_count,
            'completed_count', counts.completed_count,
            'not_applicable_count', counts.not_applicable_count,
            'scope_removed_count', counts.scope_removed_count,
            'unresolved_cancelled_count', counts.unresolved_cancelled_count,
            'unassigned_count', counts.unassigned_count,
            'processed_count', counts.completed_count + counts.not_applicable_count
              + counts.scope_removed_count,
            'percent', case when counts.total_count > 0
              then round((counts.completed_count + counts.not_applicable_count
                + counts.scope_removed_count) * 100.0 / counts.total_count)::integer
              else 0 end,
            'can_finalize', false
          ),
          'product_tasks', coalesce(task_rows.rows, '[]'::jsonb)
        )
        order by application.history_at desc, application.id desc
      ), '[]'::jsonb) as rows
      from page application
      left join task_rows on task_rows.change_application_id = application.id
      join application_counts counts on counts.id = application.id
    ),
    cursor_row as (
      select history_at, id from page
       order by history_at desc, id desc
       offset greatest(v_limit - 1, 0) limit 1
    )
    select jsonb_build_object(
      'schema_version', 1,
      'snapshot_at', v_snapshot,
      'rows', response_rows.rows,
      'has_more', (select count(*) > v_limit from bounded),
      'next_cursor', case when (select count(*) > v_limit from bounded) then (
        select jsonb_build_object('history_at', cursor_row.history_at, 'id', cursor_row.id) from cursor_row
      ) else null end
    )
    from response_rows
  );
end;
$$;

revoke all on function public.list_change_application_history_v1(
  text, text, date, date, uuid, uuid, timestamptz, uuid, integer
) from public, anon, authenticated;
grant execute on function public.list_change_application_history_v1(
  text, text, date, date, uuid, uuid, timestamptz, uuid, integer
) to authenticated;

comment on function public.complete_change_application(uuid, timestamptz, text) is
  'Active-leader final approval with task locks, OCC, exception-note validation, archive, activity, and audit.';
comment on function public.undo_change_application_completion(uuid, timestamptz, text, jsonb) is
  'Active-leader final completion undo; reopens selected product tasks with explicitly selected active assignees.';
comment on function public.get_change_bootstrap_v3() is
  'Additive v3 change bootstrap with final fields and authoritative application_summaries; v2 remains available.';
comment on function public.list_change_application_history_v1(text, text, date, date, uuid, uuid, timestamptz, uuid, integer) is
  'Permanent archived change history with literal search, filters, role-scoped task detail, and (history_at,id) keyset pagination.';
