-- Single Asia/Seoul business-timezone contract for day/year boundaries.
-- Session/database default timezone (typically UTC) must never leak into
-- business day or business year computations. These helpers convert an
-- explicit instant (defaulting to statement_timestamp()) into the KST
-- calendar date/year, mirroring src/lib/businessTime.ts on the client.

create or replace function private.sqa_business_date(p_instant timestamptz)
returns date
language sql
stable
set search_path = ''
as $$
  select (p_instant at time zone 'Asia/Seoul')::date;
$$;

create or replace function private.sqa_business_year(p_instant timestamptz)
returns integer
language sql
stable
set search_path = ''
as $$
  select extract(year from p_instant at time zone 'Asia/Seoul')::integer;
$$;

create or replace function private.sqa_business_date()
returns date
language sql
stable
set search_path = ''
as $$
  select private.sqa_business_date(statement_timestamp());
$$;

create or replace function private.sqa_business_year()
returns integer
language sql
stable
set search_path = ''
as $$
  select private.sqa_business_year(statement_timestamp());
$$;

revoke all on function private.sqa_business_date(timestamptz) from public, anon, authenticated;
revoke all on function private.sqa_business_year(timestamptz) from public, anon, authenticated;
revoke all on function private.sqa_business_date() from public, anon, authenticated;
revoke all on function private.sqa_business_year() from public, anon, authenticated;

comment on function private.sqa_business_date(timestamptz) is 'Business day boundary is Asia/Seoul regardless of session/database timezone (D-02).';
comment on function private.sqa_business_year(timestamptz) is 'Business year boundary is Asia/Seoul regardless of session/database timezone (D-02).';

-- Internal/etc change numbers previously used to_char(current_date, 'YYYY'),
-- which follows the session/database timezone (UTC in production). Around the
-- KST new year that produced numbers stamped with the wrong business year.
-- This redefinition is otherwise byte-for-byte identical to the version
-- introduced in 20260718054127_harden_change_audit_and_acl.sql.
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
      || private.sqa_business_year()::text || '-'
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
