-- NULLIF and COALESCE are PostgreSQL conditional expressions, not ordinary
-- pg_catalog functions. Keep the audit trigger search_path locked while using
-- their native syntax so the function can execute on every audited mutation.
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
  v_reason text := nullif(pg_catalog.current_setting('sqa.audit_reason', true), '');
  v_source text := coalesce(
    nullif(pg_catalog.current_setting('sqa.audit_source', true), ''),
    'database'
  );
  v_correlation_text text := nullif(
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
    select coalesce(
             pg_catalog.array_agg(field.key order by field.key),
             '{}'::text[]
           )
      into v_changed_fields
      from pg_catalog.jsonb_object_keys(v_new_sanitized) as field(key);
    v_after := v_new_sanitized;
  else
    select coalesce(
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
    tg_argv[0], nullif(v_row ->> 'id', '')::uuid,
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

comment on function private.record_mutation_audit() is
  'Transaction-bound audit v3: INSERT/DELETE business snapshots and UPDATE field deltas.';
