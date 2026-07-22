-- Preserve a durable distinction between a change that every in-scope product
-- actually applied and a change whose queue was merely closed with one or more
-- not-applicable decisions. The archive reason is intentionally reused as the
-- client-visible signal so capped task-history responses remain truthful.

create or replace function private.enforce_archive_origin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.archived_at is null and new.archived_at is not null then
    if new.archive_reason in (
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

create or replace function private.sync_change_application_archive()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_name text;
  v_application public.change_applications%rowtype;
  v_all_applied boolean := false;
  v_archive_reason text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  select application.*
    into v_application
    from public.change_action_items action_item
    join public.change_applications application
      on application.id = action_item.change_application_id
   where action_item.id = new.action_item_id
   for update of application;

  if not found then
    return new;
  end if;

  select profile.name
    into v_actor_name
    from public.profiles profile
   where profile.id = v_actor_id;

  if old.status in ('completed', 'not_applicable')
     and new.status = 'pending'
     and v_application.archived_at is not null then
    update public.change_applications
       set archived_at = null,
           archived_by = null,
           archive_reason = null
     where id = v_application.id;

    if v_actor_id is not null then
      insert into public.activity_logs (
        actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
      ) values (
        v_actor_id, null, 'change_application', v_application.id,
        'archive_restored_automatically',
        coalesce(v_actor_name, '사용자') || '님이 제품 업무를 다시 열어 '
          || v_application.change_number || ' 변경건의 보관이 자동 해제되었습니다.',
        jsonb_build_object('task_id', new.id, 'reason', new.reopen_reason)
      );
    end if;

    return new;
  end if;

  if old.status = 'pending'
     and new.status in ('completed', 'not_applicable')
     and v_application.status = 'published'
     and v_application.archived_at is null
     and not exists (
       select 1
         from public.product_change_tasks task
         join public.change_action_items action_item on action_item.id = task.action_item_id
        where action_item.change_application_id = v_application.id
          and task.status = 'pending'
     ) then
    select not exists (
      select 1
        from public.product_change_tasks task
        join public.change_action_items action_item on action_item.id = task.action_item_id
       where action_item.change_application_id = v_application.id
         and task.status not in ('completed', 'cancelled')
    ) into v_all_applied;

    v_archive_reason := case
      when v_all_applied then '모든 제품 적용이 완료되어 자동 보관됨'
      else '모든 제품 적용업무가 처리되어 자동 보관됨'
    end;

    update public.change_applications
       set archived_at = now(),
           archived_by = null,
           archive_reason = v_archive_reason
     where id = v_application.id;

    if v_actor_id is not null then
      insert into public.activity_logs (
        actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
      ) values (
        v_actor_id, null, 'change_application', v_application.id, 'auto_archived',
        case
          when v_all_applied then v_application.change_number || ' 변경건의 모든 제품 적용이 완료되어 자동 보관되었습니다.'
          else v_application.change_number || ' 변경건의 모든 제품 적용업무가 처리되어 자동 보관되었습니다.'
        end,
        jsonb_build_object(
          'task_id', new.id,
          'final_task_status', new.status,
          'completion_kind', case when v_all_applied then 'all_applied' else 'processed_with_exceptions' end
        )
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_change_application_archive() from public, anon, authenticated;

-- Upgrade existing automatic archives when the authoritative task ledger proves
-- that every active product completed the application.
update public.change_applications application
   set archive_reason = '모든 제품 적용이 완료되어 자동 보관됨'
 where application.archived_at is not null
   and application.archive_origin = 'automatic'
   and exists (
     select 1
       from public.product_change_tasks task
       join public.change_action_items action_item on action_item.id = task.action_item_id
      where action_item.change_application_id = application.id
        and task.status = 'completed'
   )
   and not exists (
     select 1
       from public.product_change_tasks task
       join public.change_action_items action_item on action_item.id = task.action_item_id
      where action_item.change_application_id = application.id
        and task.status not in ('completed', 'cancelled')
   );
