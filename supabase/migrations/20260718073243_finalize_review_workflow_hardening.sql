-- Stage B: irreversible attachment cleanup and explicit ACL manifest.
--
-- This migration must only run after an operator has purged the production
-- Storage bucket through the Storage API and recorded a zero-object recheck.
-- Never delete storage.objects rows directly: doing so can orphan object blobs.

do $$
begin
  if exists (
    select 1
      from storage.objects
     where bucket_id = 'review-attachments'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'review-attachments bucket is not empty; run purge script before this migration',
      detail = 'SQA_REVIEW_ATTACHMENTS_NOT_EMPTY';
  end if;
end;
$$;

-- Storage metadata is safe to remove only after the guard above proves there
-- are no objects. The actual binary purge remains an operator-only API action.
drop policy if exists "review_attachments_select_self_or_leader" on storage.objects;
drop policy if exists "review_attachments_insert_self" on storage.objects;
drop policy if exists "review_attachments_delete_self_or_leader" on storage.objects;

-- The policy DDL waits for in-flight storage.objects writers. Recheck after the
-- write policies are gone so an upload that raced the first snapshot cannot be
-- converted into an orphan by the bucket-row cleanup below.
do $$
begin
  if exists (
    select 1
      from storage.objects
     where bucket_id = 'review-attachments'
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'review-attachments received an object during cleanup; purge and verify again',
      detail = 'SQA_REVIEW_ATTACHMENTS_RACE_DETECTED';
  end if;
end;
$$;

delete from storage.buckets
 where id = 'review-attachments';

-- Remove the compatibility-only attachment schema after Storage is empty.
drop trigger if exists review_requests_validate_attachment on public.review_requests;

-- Retire every overload of the compatibility helper. PostgreSQL treats each
-- input signature as a separate function identity.
do $$
declare
  legacy_function pg_catalog.regprocedure;
begin
  for legacy_function in
    select proc.oid::pg_catalog.regprocedure
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace ns on ns.oid = proc.pronamespace
     where ns.nspname = 'public'
       and proc.prokind = 'f'
       and proc.proname = 'validate_review_attachment_url'
  loop
    execute pg_catalog.format('drop function %s', legacy_function);
  end loop;
end;
$$;

revoke update (attachment_url) on table public.review_requests from authenticated;
alter table public.review_requests
  drop column attachment_url;

-- Password completion is observed exclusively by the private auth.users
-- encrypted_password trigger introduced in Stage A. No client acknowledgement
-- RPC or same-name overload remains in the final state.
do $$
declare
  legacy_function pg_catalog.regprocedure;
begin
  for legacy_function in
    select proc.oid::pg_catalog.regprocedure
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace ns on ns.oid = proc.pronamespace
     where ns.nspname = 'public'
       and proc.prokind = 'f'
       and proc.proname = 'mark_password_changed'
  loop
    execute pg_catalog.format('drop function %s', legacy_function);
  end loop;
end;
$$;

-- Review mutations are RPC-only. Keep the SELECT policies, but remove every
-- authenticated direct-write policy left for the Stage A compatibility window.
drop policy if exists "review_requests_insert_self_pending" on public.review_requests;
drop policy if exists "review_requests_update_leader" on public.review_requests;
drop policy if exists "review_requests_update_self_pending" on public.review_requests;
drop policy if exists "review_requests_update_self_pending_or_rejected" on public.review_requests;
drop policy if exists "review_requests_delete_leader" on public.review_requests;
drop policy if exists "review_requests_delete_self_pending" on public.review_requests;

drop policy if exists "review_feedback_insert_leader" on public.review_feedback;
drop policy if exists "review_feedback_update_leader" on public.review_feedback;
drop policy if exists "review_feedback_delete_leader" on public.review_feedback;

-- Remove noncanonical review overloads instead of merely hiding them from the
-- browser and then re-exposing them through the service_role all-routines grant.
do $$
declare
  legacy_function pg_catalog.regprocedure;
begin
  for legacy_function in
    select proc.oid::pg_catalog.regprocedure
      from pg_catalog.pg_proc proc
      join pg_catalog.pg_namespace ns on ns.oid = proc.pronamespace
     where ns.nspname = 'public'
       and proc.prokind = 'f'
       and proc.proname in (
         'create_review_request',
         'update_review_request',
         'withdraw_review_request',
         'approve_review_request',
         'reject_review_request',
         'reopen_review_request',
         'resubmit_review_request',
         'add_review_feedback',
         'update_review_feedback',
         'void_review_feedback',
         'mark_review_seen',
         'mark_all_relevant_reviews_seen',
         'get_review_statistics'
       )
       and proc.oid::pg_catalog.regprocedure <> all (array[
         'public.create_review_request(text,text,date)'::pg_catalog.regprocedure,
         'public.update_review_request(uuid,timestamptz,text,text,date)'::pg_catalog.regprocedure,
         'public.withdraw_review_request(uuid,timestamptz,text)'::pg_catalog.regprocedure,
         'public.approve_review_request(uuid,timestamptz)'::pg_catalog.regprocedure,
         'public.reject_review_request(uuid,timestamptz,text)'::pg_catalog.regprocedure,
         'public.reopen_review_request(uuid,timestamptz)'::pg_catalog.regprocedure,
         'public.resubmit_review_request(uuid,timestamptz,text)'::pg_catalog.regprocedure,
         'public.add_review_feedback(uuid,text)'::pg_catalog.regprocedure,
         'public.update_review_feedback(uuid,timestamptz,text)'::pg_catalog.regprocedure,
         'public.void_review_feedback(uuid,timestamptz,text)'::pg_catalog.regprocedure,
         'public.mark_review_seen(uuid)'::pg_catalog.regprocedure,
         'public.mark_all_relevant_reviews_seen()'::pg_catalog.regprocedure,
         'public.get_review_statistics(date,date,uuid)'::pg_catalog.regprocedure
       ])
  loop
    execute pg_catalog.format('drop function %s', legacy_function);
  end loop;
end;
$$;

-- This migration-era audit table was the only remaining public table without
-- RLS. It is service-only and has no browser policy.
alter table public.product_dedup_audit enable row level security;

-- Reset current-object ACLs before applying the manifest below. This removes
-- implicit Supabase defaults from legacy objects and prevents an overlooked
-- function overload from remaining callable.
revoke all privileges on all tables in schema public from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema public from public, anon, authenticated, service_role;
revoke execute on all routines in schema public from public, anon, authenticated, service_role;
revoke all on schema public from public, anon, authenticated, service_role;

revoke all privileges on all tables in schema private from public, anon, authenticated, service_role;
revoke all privileges on all sequences in schema private from public, anon, authenticated, service_role;
revoke execute on all routines in schema private from public, anon, authenticated, service_role;
revoke all on schema private from public, anon, authenticated, service_role;

grant usage on schema public to authenticated, service_role;

-- The browser is authenticated before it can access any business object.
-- RLS remains the row-level authority on every table listed here.
grant select on table
  public.profiles,
  public.allowed_users,
  public.profile_notes,
  public.products,
  public.product_assignments,
  public.duty_major_categories,
  public.duties,
  public.duty_assignments,
  public.review_requests,
  public.review_feedback,
  public.review_events,
  public.review_read_receipts,
  public.projects,
  public.project_assignments,
  public.activity_logs,
  public.public_leader_profiles,
  public.announcements,
  public.change_applications,
  public.change_action_items,
  public.product_change_tasks
to authenticated;

-- Existing non-review direct writes are retained only where the application
-- currently uses them and RLS/trigger invariants already enforce the actor.
grant insert, update, delete on table
  public.allowed_users,
  public.products,
  public.duty_major_categories,
  public.duties
to authenticated;
grant update on table public.profiles to authenticated;
grant update, delete on table public.projects to authenticated;
grant delete on table public.announcements to authenticated;
grant insert (title, body, is_pinned) on table public.announcements to authenticated;
grant update (title, body, is_pinned) on table public.announcements to authenticated;

-- RLS helpers intentionally exposed to authenticated sessions.
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_leader() to authenticated;
grant execute on function public.is_active_self() to authenticated;
grant execute on function public.password_is_current() to authenticated;
grant execute on function public.can_use_app() to authenticated;
grant execute on function public.is_active_leader() to authenticated;
grant execute on function public.profile_has_role(uuid, public.app_role) to authenticated;

-- Assignment and project RPCs used by the current application.
grant execute on function public.create_project_with_assignments(text, text, date, public.project_status, uuid[]) to authenticated;
grant execute on function public.replace_project_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.replace_project_assignments_if_current(uuid, uuid[], timestamptz) to authenticated;
grant execute on function public.replace_product_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.replace_product_assignments_with_reason(uuid, uuid[], text) to authenticated;
grant execute on function public.replace_duty_assignments(uuid, uuid[]) to authenticated;
grant execute on function public.add_product_assignment(uuid, uuid) to authenticated;
grant execute on function public.add_duty_assignment(uuid, uuid) to authenticated;
grant execute on function public.assign_product_and_transfer_change_tasks(uuid, uuid, boolean, text) to authenticated;

-- Review RPCs are the only authenticated review write surface. Only the
-- canonical signatures retained above are re-granted.
grant execute on function public.create_review_request(text, text, date) to authenticated;
grant execute on function public.update_review_request(uuid, timestamptz, text, text, date) to authenticated;
grant execute on function public.withdraw_review_request(uuid, timestamptz, text) to authenticated;
grant execute on function public.approve_review_request(uuid, timestamptz) to authenticated;
grant execute on function public.reject_review_request(uuid, timestamptz, text) to authenticated;
grant execute on function public.reopen_review_request(uuid, timestamptz) to authenticated;
grant execute on function public.resubmit_review_request(uuid, timestamptz, text) to authenticated;
grant execute on function public.add_review_feedback(uuid, text) to authenticated;
grant execute on function public.update_review_feedback(uuid, timestamptz, text) to authenticated;
grant execute on function public.void_review_feedback(uuid, timestamptz, text) to authenticated;
grant execute on function public.mark_review_seen(uuid) to authenticated;
grant execute on function public.mark_all_relevant_reviews_seen() to authenticated;
grant execute on function public.get_review_statistics(date, date, uuid) to authenticated;

-- Change-application and audit RPCs.
grant execute on function public.list_change_application_product_scope() to authenticated;
grant execute on function public.list_change_application_assignees() to authenticated;
grant execute on function public.save_change_application_draft(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) to authenticated;
grant execute on function public.publish_change_application(
  uuid, timestamptz, text, public.change_application_source, text, text, text, date,
  public.change_action_kind, text, text, date, jsonb
) to authenticated;
grant execute on function public.complete_product_change_task(uuid, text, text) to authenticated;
grant execute on function public.mark_product_change_task_not_applicable(uuid, text, text) to authenticated;
grant execute on function public.reopen_product_change_task(uuid, text) to authenticated;
grant execute on function public.reassign_product_change_tasks(uuid[], uuid, text) to authenticated;
grant execute on function public.cancel_product_change_task(uuid, text) to authenticated;
grant execute on function public.cancel_change_application(uuid, text) to authenticated;
grant execute on function public.archive_change_application(uuid, text) to authenticated;
grant execute on function public.restore_change_application(uuid, text) to authenticated;
grant execute on function public.remove_product_from_change_scope(uuid, text) to authenticated;
grant execute on function public.restore_product_change_scope(uuid, text) to authenticated;
grant execute on function public.list_audit_events(integer, bigint) to authenticated;

-- Operational clients keep explicit full access. Trigger/RPC functions owned by
-- postgres continue to use their SECURITY DEFINER contracts.
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all routines in schema public to service_role;
grant usage on schema private to service_role;
grant all privileges on all tables in schema private to service_role;
grant all privileges on all sequences in schema private to service_role;
grant execute on all routines in schema private to service_role;

-- Opt-in API exposure for all future objects. Every later migration must grant
-- only the exact browser/service privileges its new object requires. PostgreSQL's
-- built-in PUBLIC EXECUTE default is global, so remove it without a schema clause.
alter default privileges for role postgres
  revoke execute on routines from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema public
  revoke execute on routines from public, anon, authenticated, service_role;

alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke all on sequences from public, anon, authenticated, service_role;
alter default privileges for role postgres in schema private
  revoke execute on routines from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';
