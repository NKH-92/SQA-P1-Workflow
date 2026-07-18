-- Stage A: distinguish scope removal from cancellation, distinguish automatic
-- from manual archives, and make the private audit trail delta-based.

alter table public.product_change_tasks
  add column if not exists cancel_kind text,
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by uuid references public.profiles(id) on delete set null,
  add column if not exists restored_at timestamptz,
  add column if not exists restored_by uuid references public.profiles(id) on delete set null,
  add column if not exists restore_reason text;

alter table public.product_change_tasks
  drop constraint if exists product_change_tasks_cancel_kind_check;
alter table public.product_change_tasks
  add constraint product_change_tasks_cancel_kind_check check (
    cancel_kind is null or cancel_kind in ('scope_removed', 'manual', 'application_cancelled', 'legacy')
  );

update public.product_change_tasks task
   set cancel_kind = case
         when task.resolution_reason = '제품 적용 범위에서 제외됨' then 'scope_removed'
         else 'legacy'
       end,
       cancelled_at = coalesce(task.updated_at, task.created_at)
 where task.status = 'cancelled'
   and task.cancel_kind is null;

alter table public.change_applications
  add column if not exists archive_origin text;

alter table public.change_applications
  drop constraint if exists change_applications_archive_origin_check;
alter table public.change_applications
  add constraint change_applications_archive_origin_check check (
    (archived_at is null and archive_origin is null)
    or
    (archived_at is not null and archive_origin in ('manual', 'automatic', 'migration', 'legacy_system'))
  ) not valid;

update public.change_applications
   set archive_origin = case
         when archive_reason = '모든 제품 적용업무가 처리되어 자동 보관됨' then 'automatic'
         else 'legacy_system'
       end,
       archived_by = case
         when archive_reason = '모든 제품 적용업무가 처리되어 자동 보관됨' then null
         else archived_by
       end
 where archived_at is not null
   and archive_origin is null;

alter table public.change_applications
  validate constraint change_applications_archive_origin_check;

create or replace function private.enforce_archive_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if new.archive_reason = '모든 제품 적용업무가 처리되어 자동 보관됨' then
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
drop trigger if exists change_applications_enforce_archive_origin on public.change_applications;
create trigger change_applications_enforce_archive_origin
before update of archived_at on public.change_applications
for each row execute function private.enforce_archive_origin();

create or replace function private.enforce_product_task_cancel_metadata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_application_status public.change_application_status;
begin
  if old.status <> 'cancelled' and new.status = 'cancelled' then
    select application.status into v_application_status
      from public.change_action_items action_item
      join public.change_applications application on application.id = action_item.change_application_id
     where action_item.id = new.action_item_id;
    new.cancel_kind := coalesce(new.cancel_kind,
      case
        when v_application_status = 'cancelled' then 'application_cancelled'
        when new.resolution_reason = '제품 적용 범위에서 제외됨' then 'scope_removed'
        else 'manual'
      end);
    new.cancelled_at := coalesce(new.cancelled_at, clock_timestamp());
    new.cancelled_by := coalesce(new.cancelled_by, auth.uid());
  elsif old.status = 'cancelled' and new.status = 'pending' then
    if old.cancel_kind <> 'scope_removed' then
      raise exception using
        errcode = 'P0001', message = 'only scope-removed tasks can be restored',
        detail = 'SQA_CHANGE_TASK_NOT_RESTORABLE';
    end if;
    if nullif(btrim(coalesce(new.restore_reason, '')), '') is null then
      raise exception using
        errcode = 'P0001', message = 'scope restore reason is required',
        detail = 'SQA_SCOPE_RESTORE_REASON_REQUIRED';
    end if;
    new.restored_at := clock_timestamp();
    new.restored_by := auth.uid();
    new.cancel_kind := null;
    new.cancelled_at := null;
    new.cancelled_by := null;
  end if;
  return new;
end;
$$;

revoke all on function private.enforce_product_task_cancel_metadata() from public, anon, authenticated;
drop trigger if exists product_change_tasks_enforce_cancel_metadata on public.product_change_tasks;
create trigger product_change_tasks_enforce_cancel_metadata
before update of status on public.product_change_tasks
for each row when (old.status is distinct from new.status)
execute function private.enforce_product_task_cancel_metadata();

create or replace function public.remove_product_from_change_scope(
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
  v_task public.product_change_tasks%rowtype;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'scope removal reason is required', detail = 'SQA_SCOPE_REMOVAL_REASON_REQUIRED';
  end if;
  select task.* into v_task
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join public.change_applications application on application.id = action_item.change_application_id
   where task.id = p_task_id
     and application.content_locked_at is null
     and (application.created_by = v_actor_id or public.is_active_leader())
   for update of task;
  if not found then raise exception using errcode = 'P0001', message = 'task not found', detail = 'SQA_CHANGE_TASK_NOT_FOUND'; end if;
  if v_task.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'only pending tasks can leave scope', detail = 'SQA_SCOPE_TASK_NOT_PENDING';
  end if;
  perform set_config('sqa.audit_reason', btrim(p_reason), true);
  perform set_config('sqa.audit_source', 'remove_product_from_change_scope', true);
  update public.product_change_tasks
     set status = 'cancelled', cancel_kind = 'scope_removed', resolution_reason = btrim(p_reason),
         completed_by = null, completed_by_name = null, completed_at = null,
         proxy_reason = null
   where id = p_task_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'product_change_task', p_task_id, 'scope_removed',
          v_task.product_name || ' 제품을 변경 적용범위에서 제외했습니다.',
          jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

create or replace function public.restore_product_change_scope(
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
  v_task public.product_change_tasks%rowtype;
begin
  if v_actor_id is null or not public.can_use_app() then
    raise exception using errcode = 'P0001', message = 'app access required', detail = 'SQA_APP_ACCESS_REQUIRED';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception using errcode = 'P0001', message = 'scope restore reason is required', detail = 'SQA_SCOPE_RESTORE_REASON_REQUIRED';
  end if;
  select task.* into v_task
    from public.product_change_tasks task
    join public.change_action_items action_item on action_item.id = task.action_item_id
    join public.change_applications application on application.id = action_item.change_application_id
   where task.id = p_task_id
     and application.content_locked_at is null
     and (application.created_by = v_actor_id or public.is_active_leader())
   for update of task;
  if not found then raise exception using errcode = 'P0001', message = 'task not found', detail = 'SQA_CHANGE_TASK_NOT_FOUND'; end if;
  if v_task.status <> 'cancelled' or v_task.cancel_kind <> 'scope_removed' then
    raise exception using errcode = 'P0001', message = 'task is not scope removed', detail = 'SQA_CHANGE_TASK_NOT_RESTORABLE';
  end if;
  perform set_config('sqa.audit_reason', btrim(p_reason), true);
  perform set_config('sqa.audit_source', 'restore_product_change_scope', true);
  update public.product_change_tasks
     set status = 'pending', restore_reason = btrim(p_reason), resolution_reason = null,
         proxy_reason = null, completed_by = null, completed_by_name = null, completed_at = null
   where id = p_task_id;
  insert into public.activity_logs (actor_id, entity_type, entity_id, action, summary, metadata)
  values (v_actor_id, 'product_change_task', p_task_id, 'scope_restored',
          v_task.product_name || ' 제품을 변경 적용범위에 복원했습니다.',
          jsonb_build_object('reason', btrim(p_reason)));
end;
$$;

revoke all on function public.remove_product_from_change_scope(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_product_change_scope(uuid, text) from public, anon, authenticated;
grant execute on function public.remove_product_from_change_scope(uuid, text) to authenticated;
grant execute on function public.restore_product_change_scope(uuid, text) to authenticated;

alter table private.audit_events
  add column if not exists changed_fields text[] not null default '{}'::text[],
  add column if not exists before_delta jsonb not null default '{}'::jsonb,
  add column if not exists after_delta jsonb not null default '{}'::jsonb,
  add column if not exists reason text,
  add column if not exists source text not null default 'database',
  add column if not exists correlation_id uuid,
  add column if not exists schema_version smallint not null default 2;

create or replace function private.record_mutation_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_old jsonb := case when tg_op = 'INSERT' then '{}'::jsonb else to_jsonb(old) end;
  v_new jsonb := case when tg_op = 'DELETE' then '{}'::jsonb else to_jsonb(new) end;
  v_row jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_reason text := nullif(current_setting('sqa.audit_reason', true), '');
  v_source text := coalesce(nullif(current_setting('sqa.audit_source', true), ''), 'database');
  v_correlation_text text := nullif(current_setting('sqa.audit_correlation_id', true), '');
  v_correlation_id uuid;
  v_key text;
  v_ignored constant text[] := array['updated_at', 'encrypted_password', 'token', 'secret', 'password'];
begin
  v_row := case when tg_op = 'DELETE' then v_old else v_new end;
  if v_correlation_text is not null then
    begin v_correlation_id := v_correlation_text::uuid; exception when invalid_text_representation then v_correlation_id := null; end;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in
      select key from (
        select jsonb_object_keys(v_old) as key
        union
        select jsonb_object_keys(v_new) as key
      ) keys
      where key <> all(v_ignored)
      order by key
    loop
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changed_fields := array_append(v_changed_fields, v_key);
        v_before := v_before || jsonb_build_object(v_key, v_old -> v_key);
        v_after := v_after || jsonb_build_object(v_key, v_new -> v_key);
      end if;
    end loop;
    if cardinality(v_changed_fields) = 0 then return new; end if;
  elsif tg_op = 'INSERT' then
    v_changed_fields := array['id'];
    v_after := jsonb_build_object('id', v_new -> 'id');
  else
    v_changed_fields := array['id'];
    v_before := jsonb_build_object('id', v_old -> 'id');
  end if;

  select name into v_actor_name from public.profiles where id = v_actor_id;
  insert into private.audit_events (
    entity_type, entity_id, action, actor_id, actor_name, transaction_id,
    changed_fields, before_delta, after_delta, reason, source, correlation_id, schema_version
  ) values (
    tg_argv[0], nullif(v_row ->> 'id', '')::uuid,
    case tg_op when 'INSERT' then 'inserted' when 'UPDATE' then 'updated' when 'DELETE' then 'deleted' end,
    v_actor_id, v_actor_name, txid_current(),
    v_changed_fields, v_before, v_after, v_reason, v_source, v_correlation_id, 2
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function private.record_mutation_audit() from public, anon, authenticated;

create or replace function public.list_audit_events(
  p_limit integer default 50,
  p_before_id bigint default null
)
returns table (
  id bigint,
  entity_type text,
  entity_id uuid,
  action text,
  actor_id uuid,
  actor_name text,
  changed_fields text[],
  before_delta jsonb,
  after_delta jsonb,
  reason text,
  source text,
  changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_active_leader() then
    raise exception using errcode = 'P0001', message = 'active leader required', detail = 'SQA_ACTIVE_LEADER_REQUIRED';
  end if;
  return query
  select event.id, event.entity_type, event.entity_id, event.action,
         event.actor_id, event.actor_name, event.changed_fields,
         event.before_delta, event.after_delta, event.reason, event.source, event.changed_at
    from private.audit_events event
   where p_before_id is null or event.id < p_before_id
   order by event.id desc
   limit greatest(1, least(coalesce(p_limit, 50), 100));
end;
$$;

revoke all on function public.list_audit_events(integer, bigint) from public, anon, authenticated;
grant execute on function public.list_audit_events(integer, bigint) to authenticated;

-- The original persistence routine rejected an entire edit as soon as any task
-- was cancelled. Scope-removed rows now stay historical and no longer block
-- unrelated edits. Re-inclusion is deliberately possible only through the
-- reason-required restore_product_change_scope RPC above.
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
  v_task_count integer;
  v_unique_task_count integer;
  v_was_new boolean := false;
begin
  if v_actor_id is null or not public.can_use_app() then raise exception 'permission denied'; end if;
  if p_change_application_id is null and p_expected_updated_at is not null then
    raise exception 'change application was modified by another user';
  end if;
  if p_source is null then raise exception 'change source is required'; end if;
  if char_length(v_title) not between 1 and 200 then raise exception 'title is invalid'; end if;
  if char_length(v_summary) not between 1 and 5000 then raise exception 'summary is invalid'; end if;
  if v_source_url is not null and (char_length(v_source_url) > 2000 or v_source_url !~* '^https?://') then
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
  if v_task_count <> v_unique_task_count then raise exception 'duplicate product task'; end if;

  if v_change_number = '' then
    if p_source = 'official' then raise exception 'official change number is required'; end if;
    v_change_number := case when p_source = 'internal' then 'INT-' else 'ETC-' end
      || to_char(current_date, 'YYYY') || '-'
      || lpad(nextval('public.internal_change_number_seq'::regclass)::text, 4, '0');
  end if;
  if char_length(v_change_number) > 100 then raise exception 'change number is invalid'; end if;
  select name into v_actor_name from public.profiles where id = v_actor_id;
  perform set_config('sqa.audit_reason', case when p_publish then '변경 적용업무 저장 및 게시' else '변경 적용업무 초안 저장' end, true);
  perform set_config('sqa.audit_source', case when p_publish then 'publish_change_application' else 'save_change_application_draft' end, true);

  if p_change_application_id is null then
    v_was_new := true;
    insert into public.change_applications (
      change_number, source, title, summary, source_url, effective_date,
      status, created_by, published_at
    ) values (
      v_change_number, p_source, v_title, v_summary, v_source_url, p_effective_date,
      case when p_publish then 'published'::public.change_application_status else 'draft'::public.change_application_status end,
      v_actor_id, case when p_publish then clock_timestamp() else null end
    ) returning * into v_application;
  else
    select * into v_application from public.change_applications
     where id = p_change_application_id for update;
    if not found then raise exception 'change application not found'; end if;
    if v_application.status = 'cancelled' then raise exception 'cancelled change application cannot be edited'; end if;
    if v_application.created_by <> v_actor_id and not public.is_active_leader() then raise exception 'permission denied'; end if;
    if p_expected_updated_at is null or v_application.updated_at is distinct from p_expected_updated_at then
      raise exception 'change application was modified by another user';
    end if;
    if v_application.status = 'published' and not p_publish then
      raise exception 'published change application cannot return to draft';
    end if;
    if v_application.content_locked_at is not null then
      raise exception 'change application is locked after the first processed task';
    end if;
    -- Manual and application-wide cancellations remain a hard barrier. Historical
    -- scope removals are ignored so another product can still be edited.
    if exists (
      select 1
        from public.change_action_items existing_action
        join public.product_change_tasks existing_task on existing_task.action_item_id = existing_action.id
       where existing_action.change_application_id = v_application.id
         and existing_task.status = 'cancelled'
         and existing_task.cancel_kind is distinct from 'scope_removed'
    ) then
      raise exception 'manually cancelled product change task cannot be reactivated';
    end if;
    update public.change_applications
       set change_number = v_change_number, source = p_source, title = v_title,
           summary = v_summary, source_url = v_source_url, effective_date = p_effective_date,
           status = case when p_publish then 'published'::public.change_application_status else 'draft'::public.change_application_status end,
           published_at = case when p_publish then coalesce(v_application.published_at, clock_timestamp()) else null end
     where id = v_application.id returning * into v_application;
  end if;
  v_application_id := v_application.id;

  select id into v_action_item_id from public.change_action_items
   where change_application_id = v_application_id order by sort_order limit 1 for update;
  if v_action_item_id is null then
    insert into public.change_action_items (
      change_application_id, kind, custom_kind_name, content, due_date, sort_order
    ) values (
      v_application_id, p_action_kind, v_custom_kind_name, v_action_content, p_due_date, 1
    ) returning id into v_action_item_id;
  else
    update public.change_action_items
       set kind = p_action_kind, custom_kind_name = v_custom_kind_name,
           content = v_action_content, due_date = p_due_date
     where id = v_action_item_id;
  end if;

  update public.product_change_tasks task
     set status = 'cancelled', cancel_kind = 'scope_removed',
         resolution_reason = '제품 적용 범위 편집에서 제외', proxy_reason = null,
         completed_by = null, completed_by_name = null, completed_at = null
   where task.action_item_id = v_action_item_id
     and task.status = 'pending'
     and not exists (
       select 1 from jsonb_array_elements(p_tasks) scope
        where (scope ->> 'product_id')::uuid = task.product_id
     );

  for v_scope in
    select (scope ->> 'product_id')::uuid as product_id,
           nullif(scope ->> 'assignee_id', '')::uuid as assignee_id,
           nullif(btrim(coalesce(scope ->> 'product_note', '')), '') as product_note
      from jsonb_array_elements(p_tasks) scope
  loop
    select product.name into v_product_name from public.products product where product.id = v_scope.product_id;
    if not found then raise exception 'product not found'; end if;
    v_assignee_name := null;
    if v_scope.assignee_id is not null then
      select profile.name into v_assignee_name from public.profiles profile
       where profile.id = v_scope.assignee_id and profile.is_active;
      if not found then raise exception 'assignee must be an active profile'; end if;
      if exists (
        select 1 from public.product_assignments current_assignment
        join public.profiles current_profile on current_profile.id = current_assignment.user_id
        where current_assignment.product_id = v_scope.product_id and current_profile.is_active
      ) and not exists (
        select 1 from public.product_assignments selected_assignment
        join public.profiles selected_profile on selected_profile.id = selected_assignment.user_id
        where selected_assignment.product_id = v_scope.product_id
          and selected_assignment.user_id = v_scope.assignee_id and selected_profile.is_active
      ) then raise exception 'assignee must be a current product assignee'; end if;
    end if;

    v_existing_task := null;
    select task.* into v_existing_task from public.product_change_tasks task
     where task.action_item_id = v_action_item_id and task.product_id = v_scope.product_id for update;
    if not found then
      insert into public.product_change_tasks (
        action_item_id, product_id, product_name, assignee_id, assignee_name, product_note
      ) values (
        v_action_item_id, v_scope.product_id, v_product_name,
        v_scope.assignee_id, v_assignee_name, v_scope.product_note
      );
    else
      if v_existing_task.status = 'cancelled' then
        if v_existing_task.cancel_kind = 'scope_removed' then
          raise exception 'scope removed product task must be restored with a reason first';
        end if;
        raise exception 'manually cancelled product change task cannot be reactivated';
      end if;
      update public.product_change_tasks
         set product_name = v_product_name, assignee_id = v_scope.assignee_id,
             assignee_name = v_assignee_name, product_note = v_scope.product_note,
             status = 'pending', resolution_reason = null, proxy_reason = null,
             completed_by = null, completed_by_name = null, completed_at = null
       where id = v_existing_task.id;
    end if;
  end loop;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, null, 'change_application', v_application_id,
    case when v_was_new and p_publish then 'published' when v_was_new then 'draft_saved'
         when p_publish then 'updated' else 'draft_saved' end,
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

comment on column public.change_applications.archive_origin is 'manual, automatic, migration, or legacy_system; automatic archives never claim a human actor.';
comment on column public.product_change_tasks.cancel_kind is 'Separates scope removal from manual task or whole-application cancellation.';
comment on function public.restore_product_change_scope(uuid, text) is 'Restores only scope-removed tasks and requires a reason.';
