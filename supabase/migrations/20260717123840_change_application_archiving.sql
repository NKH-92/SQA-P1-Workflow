-- Preserve completed change-application history without keeping it in the
-- default active queue. Archiving is reversible and never deletes audit data.

alter table public.change_applications
  add column archived_at timestamptz,
  add column archived_by uuid references public.profiles(id) on delete set null,
  add column archive_reason text;

alter table public.change_applications
  add constraint change_applications_archive_state_check
    check (
      (archived_at is null and archived_by is null and archive_reason is null)
      or (archived_at is not null and archive_reason is not null)
    ),
  add constraint change_applications_archive_reason_length_check
    check (archive_reason is null or char_length(archive_reason) between 1 and 2000);

create index change_applications_archived_at_idx
  on public.change_applications(archived_at desc)
  where archived_at is not null;

comment on column public.change_applications.archived_at is
  'Soft-archive timestamp. Archived records remain queryable and restorable.';
comment on column public.change_applications.archived_by is
  'Profile that archived the record; null is retained when the profile is removed or a system backfill archived it.';
comment on column public.change_applications.archive_reason is
  'Required reason for manual or automatic soft archiving.';

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

  -- Reopening a terminal task must also return its parent to the active queue.
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

  -- A cancellation does not imply successful completion. Automatic archiving
  -- only runs when the final pending task is completed or marked not applicable.
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
    update public.change_applications
       set archived_at = now(),
           archived_by = v_actor_id,
           archive_reason = '모든 제품 적용업무가 처리되어 자동 보관됨'
     where id = v_application.id;

    if v_actor_id is not null then
      insert into public.activity_logs (
        actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
      ) values (
        v_actor_id, null, 'change_application', v_application.id, 'auto_archived',
        v_application.change_number || ' 변경건의 모든 제품 적용업무가 처리되어 자동 보관되었습니다.',
        jsonb_build_object('task_id', new.id, 'final_task_status', new.status)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.sync_change_application_archive() from public, anon, authenticated;

drop trigger if exists product_change_tasks_sync_application_archive
  on public.product_change_tasks;
create trigger product_change_tasks_sync_application_archive
after update of status on public.product_change_tasks
for each row
when (old.status is distinct from new.status)
execute function private.sync_change_application_archive();

create or replace function public.archive_change_application(
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
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() or not public.is_active_leader() then raise exception 'permission denied'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'archive reason is required'; end if;

  select *
    into v_application
    from public.change_applications
   where id = p_change_application_id
   for update;
  if not found then raise exception 'change application not found'; end if;
  if v_application.archived_at is not null then raise exception 'change application is already archived'; end if;

  if not exists (
    select 1
      from public.product_change_tasks task
      join public.change_action_items action_item on action_item.id = task.action_item_id
     where action_item.change_application_id = v_application.id
  ) then
    raise exception 'change application has no product tasks';
  end if;

  if exists (
    select 1
      from public.product_change_tasks task
      join public.change_action_items action_item on action_item.id = task.action_item_id
     where action_item.change_application_id = v_application.id
       and task.status = 'pending'
  ) then
    raise exception 'change application has pending product tasks';
  end if;

  select profile.name into v_actor_name
    from public.profiles profile
   where profile.id = v_actor_id;

  update public.change_applications
     set archived_at = now(),
         archived_by = v_actor_id,
         archive_reason = v_reason
   where id = v_application.id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, null, 'change_application', v_application.id, 'archived',
    coalesce(v_actor_name, '파트장') || '님이 ' || v_application.change_number || ' 변경건을 보관했습니다.',
    jsonb_build_object('reason', v_reason)
  );
end;
$$;

create or replace function public.restore_change_application(
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
begin
  if v_actor_id is null then raise exception 'authentication required'; end if;
  if not public.can_use_app() or not public.is_active_leader() then raise exception 'permission denied'; end if;
  if v_reason is null or char_length(v_reason) > 2000 then raise exception 'restore reason is required'; end if;

  select *
    into v_application
    from public.change_applications
   where id = p_change_application_id
   for update;
  if not found then raise exception 'change application not found'; end if;
  if v_application.archived_at is null then raise exception 'change application is not archived'; end if;

  select profile.name into v_actor_name
    from public.profiles profile
   where profile.id = v_actor_id;

  update public.change_applications
     set archived_at = null,
         archived_by = null,
         archive_reason = null
   where id = v_application.id;

  insert into public.activity_logs (
    actor_id, target_user_id, entity_type, entity_id, action, summary, metadata
  ) values (
    v_actor_id, null, 'change_application', v_application.id, 'restored',
    coalesce(v_actor_name, '파트장') || '님이 ' || v_application.change_number || ' 변경건을 보관함에서 복원했습니다.',
    jsonb_build_object(
      'reason', v_reason,
      'previous_archive_reason', v_application.archive_reason,
      'previous_archived_at', v_application.archived_at
    )
  );
end;
$$;

revoke all on function public.archive_change_application(uuid, text) from public, anon, authenticated;
revoke all on function public.restore_change_application(uuid, text) from public, anon, authenticated;
grant execute on function public.archive_change_application(uuid, text) to authenticated;
grant execute on function public.restore_change_application(uuid, text) to authenticated;

comment on function public.archive_change_application(uuid, text) is
  'Leader-only reversible soft archive. Requires at least one product task and no pending tasks.';
comment on function public.restore_change_application(uuid, text) is
  'Leader-only restore of a soft-archived change application.';

-- Preserve already-completed published history under the same default behavior.
-- Cancelled records are intentionally left visible for a leader to review and archive manually.
update public.change_applications application
   set archived_at = coalesce((
         select max(task.updated_at)
           from public.product_change_tasks task
           join public.change_action_items action_item on action_item.id = task.action_item_id
          where action_item.change_application_id = application.id
       ), now()),
       archived_by = application.created_by,
       archive_reason = '모든 제품 적용업무가 처리되어 자동 보관됨'
 where application.status = 'published'
   and application.archived_at is null
   and exists (
     select 1
       from public.product_change_tasks task
       join public.change_action_items action_item on action_item.id = task.action_item_id
      where action_item.change_application_id = application.id
        and task.status in ('completed', 'not_applicable')
   )
   and not exists (
     select 1
       from public.product_change_tasks task
       join public.change_action_items action_item on action_item.id = task.action_item_id
      where action_item.change_application_id = application.id
        and task.status = 'pending'
   );
