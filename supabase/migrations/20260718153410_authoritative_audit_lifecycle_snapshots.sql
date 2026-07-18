-- Audit schema v3: lifecycle events preserve an explicit business-field
-- snapshot while future columns remain excluded until deliberately allowlisted.

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
      'archive_reason', 'archive_origin', 'created_by', 'published_at', 'cancelled_at',
      'cancellation_reason', 'created_at'
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

create or replace function private.record_mutation_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_before jsonb := '{}'::jsonb;
  v_after jsonb := '{}'::jsonb;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_old_sanitized jsonb := '{}'::jsonb;
  v_new_sanitized jsonb := '{}'::jsonb;
  v_row jsonb;
  v_changed_fields text[] := '{}'::text[];
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_reason text := pg_catalog.nullif(pg_catalog.current_setting('sqa.audit_reason', true), '');
  v_source text := pg_catalog.coalesce(
    pg_catalog.nullif(pg_catalog.current_setting('sqa.audit_source', true), ''),
    'database'
  );
  v_correlation_text text := pg_catalog.nullif(
    pg_catalog.current_setting('sqa.audit_correlation_id', true),
    ''
  );
  v_correlation_id uuid;
  v_key text;
begin
  if tg_op <> 'INSERT' then
    v_old := pg_catalog.to_jsonb(old);
    v_old_sanitized := private.build_audit_business_snapshot(tg_argv[0], v_old);
  end if;
  if tg_op <> 'DELETE' then
    v_new := pg_catalog.to_jsonb(new);
    v_new_sanitized := private.build_audit_business_snapshot(tg_argv[0], v_new);
  end if;

  v_row := case when tg_op = 'DELETE' then v_old else v_new end;
  if v_correlation_text is not null then
    v_correlation_id := v_correlation_text::uuid;
  end if;

  if tg_op = 'UPDATE' then
    for v_key in
      select candidate.key
        from (
          select old_key.key
            from pg_catalog.jsonb_object_keys(v_old_sanitized) as old_key(key)
          union
          select new_key.key
            from pg_catalog.jsonb_object_keys(v_new_sanitized) as new_key(key)
        ) as candidate
       order by candidate.key
    loop
      if (v_old_sanitized -> v_key) is distinct from (v_new_sanitized -> v_key) then
        v_changed_fields := pg_catalog.array_append(v_changed_fields, v_key);
        v_before := v_before || pg_catalog.jsonb_build_object(v_key, v_old_sanitized -> v_key);
        v_after := v_after || pg_catalog.jsonb_build_object(v_key, v_new_sanitized -> v_key);
      end if;
    end loop;
    if pg_catalog.cardinality(v_changed_fields) = 0 then
      return new;
    end if;
  elsif tg_op = 'INSERT' then
    select pg_catalog.coalesce(
             pg_catalog.array_agg(field.key order by field.key),
             '{}'::text[]
           )
      into v_changed_fields
      from pg_catalog.jsonb_object_keys(v_new_sanitized) as field(key);
    v_after := v_new_sanitized;
  else
    select pg_catalog.coalesce(
             pg_catalog.array_agg(field.key order by field.key),
             '{}'::text[]
           )
      into v_changed_fields
      from pg_catalog.jsonb_object_keys(v_old_sanitized) as field(key);
    v_before := v_old_sanitized;
  end if;

  select profile.name
    into v_actor_name
    from public.profiles as profile
   where profile.id = v_actor_id;

  insert into private.audit_events (
    entity_type, entity_id, action, actor_id, actor_name, transaction_id,
    changed_fields, before_delta, after_delta, reason, source, correlation_id,
    schema_version
  ) values (
    tg_argv[0], pg_catalog.nullif(v_row ->> 'id', '')::uuid,
    case tg_op when 'INSERT' then 'inserted' when 'UPDATE' then 'updated' when 'DELETE' then 'deleted' end,
    v_actor_id, v_actor_name, pg_catalog.txid_current(),
    v_changed_fields, v_before, v_after, v_reason, v_source, v_correlation_id,
    3
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.record_mutation_audit()
  from public, anon, authenticated;

comment on function private.build_audit_business_snapshot(text, jsonb) is
  'Audit v3 explicit business-field allowlist. Unknown entities fail closed and arbitrary metadata is never copied.';
comment on function private.record_mutation_audit() is
  'Transaction-bound audit v3: INSERT/DELETE business snapshots and UPDATE field deltas.';
