import { describe, expect, it } from 'vitest'

const migrations = import.meta.glob('../supabase/migrations/*.sql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function readMigration(name: string) {
  return migrations[`../supabase/migrations/${name}`] ?? ''
}

describe('Supabase migrations', () => {
  it('keeps real tenant seed data out of generic migrations', () => {
    const combined = Object.values(migrations).join('\n')
    const privateDomain = ['@', 'hanlim', '.com'].join('')

    expect(combined).not.toContain(privateDomain)
  })

  it('enforces role invariants for project and feedback writes', () => {
    const hardeningMigration = readMigration('202607040002_harden_role_invariants.sql')

    expect(hardeningMigration).toContain('project_assignments_validate_member')
    expect(hardeningMigration).toContain("public.profile_has_role(user_id, 'member')")
    expect(hardeningMigration).toContain('projects_insert_leader_creator')
    expect(hardeningMigration).toContain("public.profile_has_role(created_by, 'leader')")
    expect(hardeningMigration).toContain('review_feedback_validate_leader')
  })

  it('adds review deadlines and relevant activity logs for the operations queue', () => {
    const queueMigration = readMigration('202607040003_operational_queue.sql')

    expect(queueMigration).toContain('add column if not exists due_date date')
    expect(queueMigration).toContain('create table if not exists public.activity_logs')
    expect(queueMigration).toContain('activity_logs_select_relevant')
    expect(queueMigration).toContain('actor_id = auth.uid()')
    expect(queueMigration).toContain('or target_user_id is null')
  })

  it('allows members to update or withdraw pending review requests', () => {
    const migration = readMigration('202607050001_member_review_update_delete.sql')

    expect(migration).toContain('review_requests_update_self_pending')
    expect(migration).toContain('review_requests_delete_self_pending')
    expect(migration).toContain("requester_id = auth.uid() and status = 'pending'")
  })

  it('creates review attachment storage bucket with scoped upload policies', () => {
    const migration = readMigration('202607050002_review_attachments_storage.sql')

    expect(migration).toContain('review-attachments')
    expect(migration).toContain('storage.objects')
    expect(migration).toContain('auth.uid()')
  })

  it('adds profile is_active and can_use_app guard for member access', () => {
    const migration = readMigration('202607050003_profile_is_active.sql')

    expect(migration).toContain('is_active boolean')
    expect(migration).toContain('is_active_self')
    expect(migration).toContain('can_use_app')
  })

  it('applies active access guards across member-facing and leader policies', () => {
    const migration = readMigration('202607050004_harden_active_access_rls.sql')

    expect(migration).toContain('is_active_leader')
    expect(migration).toContain("select public.is_active_self()")
    expect(migration).toContain('products_select_assigned_or_leader')
    expect(migration).toContain('projects_select_assigned_or_leader')
    expect(migration).toContain('review_feedback_select_requester_or_leader')
    expect(migration).toContain('activity_logs_insert_actor')
    expect(migration).toContain('review_attachments_insert_self')
  })

  it('adds atomic review/project RPCs and attachment ownership guard', () => {
    const migration = readMigration('202607050005_atomic_mutations_and_attachment_guard.sql')

    expect(migration).toContain('reject_review_request')
    expect(migration).toContain('add_review_feedback')
    expect(migration).toContain('create_project_with_assignments')
    expect(migration).toContain('validate_review_attachment_url')
    expect(migration).toContain('attachment path must belong to the current user')
  })

  it('adds product allocation metadata for P1 product exports', () => {
    const migration = readMigration('202607050006_product_allocation_metadata.sql')

    expect(migration).toContain('category text')
    expect(migration).toContain('company_name text')
    expect(migration).toContain('sort_order integer')
    expect(migration).toContain("category in ('자사', '위탁')")
  })

  it('removes in_review from review status workflow', () => {
    const migration = readMigration('202607050007_remove_in_review_status.sql')

    expect(migration).toContain("set status = 'pending'")
    expect(migration).toContain("where status = 'in_review'")
    expect(migration).toContain("as enum ('pending', 'approved', 'rejected')")
    expect(migration).not.toContain("set status = 'in_review'")
  })

  it('removes unused product code and assignment status columns', () => {
    const migration = readMigration('202607050008_remove_product_code_and_assignment_status.sql')

    expect(migration).toContain('drop column if exists code')
    expect(migration).toContain('drop column if exists status')
  })

  it('adds duty major categories and links duties to them', () => {
    const migration = readMigration('202607050009_duty_major_categories.sql')

    expect(migration).toContain('create table public.duty_major_categories')
    expect(migration).toContain('major_category_id uuid references public.duty_major_categories')
    expect(migration).toContain('duties_major_category_name_key unique (major_category_id, name)')
  })

  it('adds duty allocation metadata for assignee labels and notes', () => {
    const migration = readMigration('202607050010_duty_allocation_metadata.sql')

    expect(migration).toContain('assignee_label text')
    expect(migration).toContain('notes text')
  })

  it('adds atomic assignment replace, review status RPC, and active-user guards', () => {
    const migration = readMigration('202607060001_p0_atomic_assignments_and_review_status.sql')

    expect(migration).toContain('replace_project_assignments')
    expect(migration).toContain('update_review_request_status')
    expect(migration).toContain('profile_is_active')
    expect(migration).toContain('project_assignments.user_id must reference an active profile')
    expect(migration).toContain('product_assignments_validate_active')
    expect(migration).toContain('duty_assignments_validate_active')
    expect(migration).toContain('use reject_review_request for rejected status')
    expect(migration).toContain('set search_path = public')
  })

  it('adds product name uniqueness and atomic product/duty assignment RPCs', () => {
    const migration = readMigration('202607060002_p1_product_unique_and_assignment_rpcs.sql')

    expect(migration).toContain('products_name_key unique (name)')
    expect(migration).toContain('replace_product_assignments')
    expect(migration).toContain('replace_duty_assignments')
    expect(migration).toContain('is_active_leader')
    expect(migration).toContain('set search_path = public')
  })

  it('adds role-checked, add-only product and duty assignment RPCs', () => {
    const migration = readMigration('202607110001_add_single_assignment_rpcs.sql')

    expect(migration).toContain('add_product_assignment')
    expect(migration).toContain('add_duty_assignment')
    expect(migration).toContain("require_profile_role(p_user_id, 'member'")
    expect(migration).toContain('profile_is_active(p_user_id)')
    expect(migration).toContain('on conflict (user_id, product_id) do nothing')
    expect(migration).toContain('on conflict (user_id, duty_id) do nothing')
    expect(migration).toContain('revoke all on function public.add_product_assignment(uuid, uuid) from public')
    expect(migration).toContain('grant execute on function public.add_duty_assignment(uuid, uuid) to authenticated')
  })

  it('requires active member targets for all product and duty assignment write paths', () => {
    const migration = readMigration('202607110002_require_member_for_assignments.sql')

    expect(migration).toContain('create or replace function public.validate_assignment_user_active()')
    expect(migration).toContain("require_profile_role(new.user_id, 'member'")
    expect(migration).toContain('profile_is_active(new.user_id)')
    expect(migration).toContain('return new')
  })

  it('gates the owner-executed leader name view by current app access', () => {
    const migration = readMigration('202607110003_gate_public_leader_profiles.sql')
    expect(migration).toContain('public.can_use_app()')
    expect(migration).toContain('security_invoker = false')
    expect(migration).toContain('revoke all on public.public_leader_profiles from public')
    expect(migration).toContain('grant select on public.public_leader_profiles to authenticated')
  })

  it('makes review status RPC-only and records committed transitions privately', () => {
    const migration = readMigration('202607110004_restrict_review_status_and_audit.sql')
    expect(migration).toContain('revoke update on table public.review_requests from authenticated')
    expect(migration).toContain('grant update (title, description, attachment_url, due_date)')
    expect(migration).toContain('create table if not exists private.review_status_events')
    expect(migration).toContain('after update of status on public.review_requests')
    expect(migration).toContain('when (old.status is distinct from new.status)')
    expect(migration).toContain('txid_current()')
    expect(migration).toContain('revoke all on schema private from authenticated')
  })

  it('records core mutations in a private transaction-bound audit trail', () => {
    const migration = readMigration('202607110005_private_mutation_audit.sql')
    expect(migration).toContain('create table if not exists private.audit_events')
    expect(migration).toContain('security definer')
    expect(migration).toContain('txid_current()')
    expect(migration).toContain("when 'UPDATE' then 'updated'")
    expect(migration).toContain("private.record_mutation_audit('product_assignment')")
    expect(migration).toContain("private.record_mutation_audit('review_request')")
    expect(migration).toContain("private.record_mutation_audit('project_assignment')")
    expect(migration).toContain('revoke all on table private.audit_events from authenticated')
    expect(migration).not.toContain('old_row')
    expect(migration).not.toContain('new_row')
  })

  it('serializes concurrent last-active-leader checks', () => {
    const migration = readMigration('202607110006_serialize_last_leader_guard.sql')
    expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(2)
    expect(migration).toContain("hashtextextended('sqa-p1-active-leader-guard', 0)")
    expect(migration).toContain('volatile')
    expect(migration).toContain('fresh SPI snapshot')
    expect(migration).toContain('revoke all on function public.count_active_leaders_except(uuid) from authenticated')
    expect(migration).toContain('public.count_active_leaders_except(old.id) = 0')
    expect(migration).toContain('public.count_active_leaders_except(linked_profile_id) = 0')
  })

  it('adds optimistic concurrency to project assignment replacement', () => {
    const migration = readMigration('202607110007_serialize_project_assignment_replace.sql')
    expect(migration).toContain('replace_project_assignments_if_current')
    expect(migration).toContain('p_expected_updated_at timestamptz')
    expect(migration).toContain('returns timestamptz')
    expect(migration).toContain('for update')
    expect(migration).toContain('project changed since it was opened')
    expect(migration).toContain('set updated_at = clock_timestamp()')
    expect(migration).toContain('return v_current_updated_at')
    expect(migration).toContain('grant execute on function public.replace_project_assignments_if_current')
  })

  it('adds leader-only audited reopen and comment-only feedback correction', () => {
    const migration = readMigration('202607110008_reopen_review_requests.sql')
    expect(migration).toContain('reopen_review_request')
    expect(migration).toContain('public.is_active_leader()')
    expect(migration).toContain('for update')
    expect(migration).toContain("only approved or rejected review requests can be reopened")
    expect(migration).toContain("set status = 'pending'")
    expect(migration).toContain("'reopened'")
    expect(migration).toContain('jsonb_build_object')
    expect(migration).toContain('revoke update on table public.review_feedback from authenticated')
    expect(migration).toContain('grant update (comment) on table public.review_feedback to authenticated')
    expect(migration).toContain('grant execute on function public.reopen_review_request(uuid) to authenticated')
  })

  it('closes password-gated member writes and invalidates project OCC on assignment changes', () => {
    const migration = readMigration('202607110009_harden_review_member_and_project_assignment_paths.sql')
    expect(migration).toContain('public.can_use_app()')
    expect(migration).toContain('leader_id = auth.uid()')
    expect(migration).toContain('bump_project_revision_from_assignment')
    expect(migration).toContain('after insert or update or delete on public.project_assignments')
    expect(migration).toContain('clock_timestamp()')
    expect(migration).toContain('old.project_id is distinct from new.project_id')
    expect(migration).toContain('revoke insert, update, delete on table public.project_assignments from authenticated')
  })

  it('retains the baseline assignment RPC before revoking direct table writes', () => {
    const baseline = readMigration('202607060001_p0_atomic_assignments_and_review_status.sql')
    const occ = readMigration('202607110007_serialize_project_assignment_replace.sql')
    const hardening = readMigration('202607110009_harden_review_member_and_project_assignment_paths.sql')
    expect(baseline).toContain('create or replace function public.replace_project_assignments(')
    expect(occ).toContain('create or replace function public.replace_project_assignments_if_current(')
    expect(hardening.indexOf('revoke insert, update, delete on table public.project_assignments from authenticated')).toBeGreaterThan(
      hardening.indexOf('create trigger project_assignments_bump_project_revision'),
    )
  })

  it('records review status and feedback activity in the mutation transaction', () => {
    const migration = readMigration('202607110010_atomic_review_activity_logs.sql')
    expect(migration).toContain('create or replace function public.update_review_request_status')
    expect(migration).toContain('create or replace function public.reject_review_request')
    expect(migration).toContain('create or replace function public.add_review_feedback')
    expect(migration).toContain('security definer')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('for update')
    expect(migration).toContain('insert into public.activity_logs')
    expect(migration).toContain("p_comment !~ '[^[:space:]]'")
    expect(migration).toContain('authentication required')
    expect(migration).toContain("revoke all on function public.update_review_request_status(uuid, public.review_status) from public")
    expect(migration).toContain("grant execute on function public.add_review_feedback(uuid, text) to authenticated")
  })

  it('adds profile notes to the private transaction-bound audit trail', () => {
    const migration = readMigration('202607110011_add_profile_note_private_audit.sql')
    expect(migration).toContain("to_regprocedure('private.record_mutation_audit()')")
    expect(migration).toContain('profile_notes_private_audit')
    expect(migration).toContain('after insert or update or delete on public.profile_notes')
    expect(migration).toContain("private.record_mutation_audit('profile_note')")
  })

  it('revokes leftover anon grants on the add-only assignment RPCs', () => {
    const migration = readMigration('202607120001_revoke_anon_from_add_assignment_rpcs.sql')
    expect(migration).toContain('revoke all on function public.add_product_assignment(uuid, uuid) from anon')
    expect(migration).toContain('revoke all on function public.add_duty_assignment(uuid, uuid) from anon')
    expect(migration).toContain('revoke all on public.public_leader_profiles from anon')
    expect(migration).toContain('grant execute on function public.add_product_assignment(uuid, uuid) to authenticated')
  })

  it('drops drifted role-only leader write policies on projects and assignments', () => {
    const migration = readMigration('202607120002_drop_role_only_leader_write_policies.sql')
    expect(migration).toContain('drop policy if exists "projects_write_leader" on public.projects')
    expect(migration).toContain('drop policy if exists "project_assignments_write_leader" on public.project_assignments')
  })

  it('adds atomic product unassigned reasons and current-leader project assignment', () => {
    const migration = readMigration('20260714075451_leader_ui_improvements.sql')

    expect(migration).toContain('add column if not exists unassigned_reason text')
    expect(migration).toContain('products_unassigned_reason_length_check')
    expect(migration).toContain('replace_product_assignments_with_reason')
    expect(migration).toContain('for update')
    expect(migration).toContain('product_assignments_clear_unassigned_reason')
    expect(migration).toContain('validate_product_unassigned_reason')
    expect(migration).toContain('new.user_id = auth.uid()')
    expect(migration).toContain("profile_has_role(new.user_id, 'member')")
    expect(migration).toContain("profile_has_role(new.user_id, 'leader')")
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('revoke execute on function public.validate_project_assignment_member() from anon, authenticated')
    expect(migration).toContain('grant execute on function public.replace_product_assignments_with_reason(uuid, uuid[], text) to authenticated')
  })

  it('evaluates the current user once in leader project assignment policies', () => {
    const migration = readMigration('20260714082821_optimize_leader_project_assignment_rls.sql')

    expect(migration).toContain('project_assignments_insert_leader_member')
    expect(migration).toContain('project_assignments_update_leader_member')
    expect(migration).toContain('user_id = (select auth.uid())')
    expect(migration).not.toContain('user_id = auth.uid()')
  })

  it('keeps reject and resubmit cycles on one review request with atomic history', () => {
    const migration = readMigration('20260715013615_review_resubmission_history.sql')

    expect(migration).toContain('review_round integer')
    expect(migration).toContain('rejection_count integer')
    expect(migration).toContain('last_submitted_at timestamptz')
    expect(migration).toContain('author_role public.app_role')
    expect(migration).toContain('review_requests_update_self_pending_or_rejected')
    expect(migration).toContain('create or replace function public.resubmit_review_request')
    expect(migration).toContain('for update')
    expect(migration).toContain("set status = 'pending'::public.review_status")
    expect(migration).toContain('review_round = review_round + 1')
    expect(migration).toContain("'member'::public.app_role")
    expect(migration).toContain("'resubmitted'")
    expect(migration).toContain('grant execute on function public.resubmit_review_request(uuid, text) to authenticated')
    expect(migration).not.toContain('rename column leader_id')
  })

  it('creates a trimmed, pinned announcement board with least-privilege RLS and audit', () => {
    const migration = readMigration('20260716200422_create_announcements_board.sql')

    expect(migration).toContain('create table public.announcements')
    expect(migration).toContain('title text not null')
    expect(migration).toContain('body text not null')
    expect(migration).toContain('is_pinned boolean not null default false')
    expect(migration).toContain('pinned_at timestamptz')
    expect(migration).toContain('created_by uuid not null default auth.uid()')
    expect(migration).toContain('references public.profiles(id) on delete restrict')
    expect(migration).toContain('announcements_title_length_check')
    expect(migration).toContain('char_length(title) between 1 and 200')
    expect(migration).toContain('announcements_body_length_check')
    expect(migration).toContain('char_length(body) between 1 and 20000')
    expect(migration).toContain('announcements_pin_state_check')
    expect(migration).toContain('new.title := btrim(new.title)')
    expect(migration).toContain('new.body := btrim(new.body)')
    expect(migration).toContain('new.pinned_at := now()')
    expect(migration).toContain('new.pinned_at := old.pinned_at')
    expect(migration).toContain('new.created_by is distinct from old.created_by')
    expect(migration).toContain('new.created_at is distinct from old.created_at')
    expect(migration).toContain('announcements_created_by_idx')
    expect(migration).toContain('announcements_board_order_idx')
    expect(migration).toContain('execute function public.set_updated_at()')
    expect(migration).toContain('announcements enable row level security')
    expect(migration).toContain('revoke all on table public.announcements from anon')
    expect(migration).toContain('grant select, delete on table public.announcements to authenticated')
    expect(migration).toContain('grant insert (title, body, is_pinned)')
    expect(migration).toContain('grant update (title, body, is_pinned)')
    expect(migration).toContain('announcements_select_app_user')
    expect(migration).toContain('select public.is_active_self()')
    expect(migration).not.toContain('select public.can_use_app()')
    expect(migration).toContain('announcements_insert_leader')
    expect(migration).toContain('select public.is_active_leader()')
    expect(migration).toContain('created_by = (select auth.uid())')
    expect(migration).toContain('announcements_update_leader')
    expect(migration).toContain('announcements_delete_leader')
    expect(migration).toContain('announcements_private_audit')
    expect(migration).toContain("private.record_mutation_audit('announcement')")
  })

  it('does not delete duplicate products in uniqueness migration', () => {
    const migration = readMigration('202607060002_p1_product_unique_and_assignment_rpcs.sql')

    expect(migration).not.toContain('delete from public.products')
    expect(migration).toContain('duplicate products exist')
  })

  it('audits duplicate product names without deleting data', () => {
    const migration = readMigration('202607060003_audit_product_duplicates.sql')

    expect(migration).toContain('create table if not exists public.product_dedup_audit')
    expect(migration).toContain('duplicate_name text not null')
    expect(migration).toContain('duplicate_count integer not null')
    expect(migration).toContain('group by name')
    expect(migration).toContain('having count(*) > 1')
    expect(migration).toContain('duplicate products exist. resolve duplicates manually')
    expect(migration).toContain('products_name_key unique (name)')
    expect(migration).not.toContain('delete from public.products')
  })

  it('adds password change completion RPC', () => {
    const migration = readMigration('202607040001_require_password_change.sql')

    expect(migration).toContain('mark_password_changed')
    expect(migration).toContain('must_change_password = false')
  })

  it('enforces review status transitions in RPC functions', () => {
    const migration = readMigration('202607060004_review_status_transitions.sql')

    expect(migration).toContain('for update')
    expect(migration).toContain('only pending review requests can be approved')
    expect(migration).toContain('only pending review requests can be rejected')
    expect(migration).toContain('use reject_review_request for rejected status')
  })

  it('requires storage uploads for review attachments', () => {
    const migration = readMigration('202607060005_storage_only_attachments.sql')

    expect(migration).toContain('attachment must use storage upload')
    expect(migration).toContain('storage://review-attachments/')
  })

  it('exposes minimal leader profiles for members', () => {
    const migration = readMigration('202607060006_public_leader_profiles.sql')

    expect(migration).toContain('create or replace view public.public_leader_profiles')
    expect(migration).toContain("role = 'leader'")
    expect(migration).toContain('grant select on public.public_leader_profiles to authenticated')
  })

  it('hardens audit RLS and revokes anon execute on security definer RPCs', () => {
    const migration = readMigration('202607070001_harden_audit_rls_and_revoke_anon_rpc.sql')

    expect(migration).toContain('product_dedup_audit enable row level security')
    expect(migration).toContain('security_invoker = true')
    expect(migration).toContain('revoke execute on function public.mark_password_changed() from anon')
    expect(migration).toContain('revoke execute on function public.replace_product_assignments(uuid, uuid[]) from anon')
  })

  it('records audit lifecycle snapshots from an exhaustive business-field allowlist', () => {
    const migration = readMigration('20260718153410_authoritative_audit_lifecycle_snapshots.sql')
    const combined = Object.values(migrations).join('\n')
    const triggerEntities = [...combined.matchAll(
      /private\.record_mutation_audit\('([^']+)'\)/g,
    )].map((match) => match[1]).sort()
    const allowlistedEntities = [...migration.matchAll(
      /when '([^']+)' then array\[/g,
    )].map((match) => match[1]).sort()

    expect(allowlistedEntities).toEqual(triggerEntities)
    expect(migration).toContain('private.build_audit_business_snapshot')
    expect(migration).toContain("detail = 'SQA_AUDIT_ENTITY_UNSUPPORTED:'")
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('v_after := v_new_sanitized')
    expect(migration).toContain('v_before := v_old_sanitized')
    expect(migration).toContain('v_old_sanitized -> v_key')
    expect(migration).toContain('v_new_sanitized -> v_key')
    expect(migration).toMatch(/v_changed_fields, v_before, v_after[\s\S]*\r?\n\s*3\r?\n/)
    expect(migration).toContain(
      'revoke all on function private.build_audit_business_snapshot(text, jsonb)',
    )
    expect(migration).toContain(
      'revoke all on function private.record_mutation_audit()',
    )

    const allowlistSection = migration.slice(
      migration.indexOf('v_allowed_fields := case'),
      migration.indexOf('if v_allowed_fields is null'),
    )
    for (const forbidden of [
      "'password'",
      "'encrypted_password'",
      "'token'",
      "'secret'",
      "'service_key'",
      "'session'",
      "'credential'",
      "'metadata'",
    ]) {
      expect(allowlistSection).not.toContain(forbidden)
    }
  })

  it('repairs audit conditional expressions without weakening the trigger ACL', () => {
    const migration = readMigration('20260718161549_fix_audit_nullif_syntax.sql')

    expect(migration).toContain('create or replace function private.record_mutation_audit()')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain("nullif(pg_catalog.current_setting('sqa.audit_reason', true), '')")
    expect(migration).toContain('v_source text := coalesce(')
    expect(migration).not.toMatch(/pg_catalog\.(?:nullif|coalesce)\s*\(/)
    expect(migration).toContain(
      'revoke all on function private.record_mutation_audit()',
    )
  })

  it('revokes PUBLIC execute on internal helper RPCs', () => {
    const migration = readMigration('202607070002_revoke_public_execute_on_internal_helpers.sql')

    expect(migration).toContain('revoke all on function public.can_use_app() from public')
    expect(migration).toContain('grant execute on function public.can_use_app() to authenticated')
    expect(migration).toContain('revoke all on function public.handle_new_user() from public')
  })

  it('revokes PUBLIC execute on mutation RPCs', () => {
    const migration = readMigration('202607070003_revoke_public_execute_on_mutation_rpcs.sql')

    expect(migration).toContain('revoke all on function public.mark_password_changed() from public')
    expect(migration).toContain('grant execute on function public.mark_password_changed() to authenticated')
    expect(migration).toContain('revoke all on function public.create_project_with_assignments')
    expect(migration).toContain('revoke all on function public.reject_review_request')
    expect(migration).toContain('revoke all on function public.replace_product_assignments')
    expect(migration).toContain('revoke all on function public.update_review_request_status')
  })

  it('keeps activity log entity types aligned with app events', () => {
    const migration = readMigration('202607070004_extend_activity_log_entity_types.sql')

    expect(migration).toContain("'product'")
    expect(migration).toContain("'duty'")
    expect(migration).toContain("'duty_major_category'")
    expect(migration).not.toContain('delete from public.activity_logs')
  })

  it('protects the last active leader from demotion or deactivation', () => {
    const migration = readMigration('202607070005_protect_last_active_leader.sql')

    expect(migration).toContain('cannot disable or demote the last active leader')
    expect(migration).toContain('cannot deactivate your own account')
    expect(migration).toContain('before update')
    expect(migration).toContain('profiles')
    expect(migration).toContain('allowed_users')
  })

  it('enforces password change in RLS and restores leader visibility', () => {
    const migration = readMigration('202607080001_enforce_password_change_and_restore_visibility.sql')

    expect(migration).toContain('function public.password_is_current()')
    expect(migration).toContain('not must_change_password')
    // can_use_app() and is_active_leader() must both require the password check.
    expect(migration).toContain('public.is_active_self() and public.password_is_current()')
    expect(migration).toContain(
      'public.is_leader() and public.is_active_self() and public.password_is_current()',
    )
    // leader names visible to members again.
    expect(migration).toContain('security_invoker = false')
    // last-active-leader counter locked down.
    expect(migration).toContain('revoke execute on function public.count_active_leaders_except(uuid) from anon')
  })

  it('publishes review_requests inserts over realtime without touching RLS', () => {
    const migration = readMigration('202607090001_realtime_review_requests.sql')

    expect(migration).toContain("pubname = 'supabase_realtime'")
    expect(migration).toContain('alter publication supabase_realtime add table public.review_requests')
    // Realtime publication must not weaken row visibility — no policy/grant changes here.
    expect(migration).not.toContain('create policy')
    expect(migration).not.toContain('grant ')
  })

  it('adds atomic, history-preserving product change application workflows', () => {
    const migration = readMigration('202607170001_change_applications.sql')

    expect(migration).toContain('create table public.change_applications')
    expect(migration).toContain('create table public.change_action_items')
    expect(migration).toContain('create table public.product_change_tasks')
    expect(migration).toContain('content_locked_at timestamptz')
    expect(migration).toContain('change_applications_source_url_scheme_check')
    expect(migration).toContain("source_url ~* '^https?://'")
    expect(migration).toContain('source url must use http or https')
    expect(migration).toContain('product_change_tasks_action_product_key unique (action_item_id, product_id)')
    expect(migration).toContain('product_id uuid not null references public.products(id) on delete restrict')
    expect(migration).toContain('alter table public.product_change_tasks enable row level security')
    expect(migration).toContain('case when profile.id is not null then assignment.user_id else null end')
    expect(migration).toContain('revoke all on table public.product_change_tasks from public, anon, authenticated')
    expect(migration).toContain('change_applications_select_app_user')
    expect(migration).toContain('change_action_items_select_app_user')
    expect(migration).toMatch(/published_at is not null\s+and status in \('published', 'cancelled'\)/)
    expect(migration).toMatch(/application\.published_at is not null\s+and application\.status in \('published', 'cancelled'\)/)
    expect(migration).not.toContain("status <> 'draft'")
    expect(migration).toContain('create or replace function public.publish_change_application')
    expect(migration).toMatch(
      /create or replace function private\.persist_change_application\(\s+p_change_application_id uuid,\s+p_expected_updated_at timestamptz,/,
    )
    expect(migration).toMatch(
      /create or replace function public\.save_change_application_draft\(\s+p_change_application_id uuid,\s+p_expected_updated_at timestamptz,/,
    )
    expect(migration).toMatch(
      /create or replace function public\.publish_change_application\(\s+p_change_application_id uuid,\s+p_expected_updated_at timestamptz,/,
    )
    expect(migration).toContain(
      'p_change_application_id, p_expected_updated_at, p_change_number, p_source, p_title, p_summary',
    )
    expect(migration).toContain(
      'if p_change_application_id is null and p_expected_updated_at is not null then',
    )
    expect(migration).toContain('v_application.updated_at is distinct from p_expected_updated_at')
    expect(migration).toContain('change application was modified by another user')
    expect(migration).toContain('create or replace function public.complete_product_change_task')
    expect(migration).toContain('create or replace function public.mark_product_change_task_not_applicable')
    expect(migration).toContain('create or replace function public.reopen_product_change_task')
    expect(migration).toContain('create or replace function public.reassign_product_change_tasks')
    expect(migration).toContain('create or replace function public.assign_product_and_transfer_change_tasks')
    expect(migration).toContain("and application.status = 'published'")
    expect(migration).toContain("'source', 'product_assignment_change'")
    expect(migration).toContain('change application is locked after the first processed task')
    expect(migration).toContain('assignee must be a current product assignee')
    expect(migration).toContain("application.published_at is not null")
    expect(migration).toContain("application.status in ('published', 'cancelled')")
    expect(migration).toContain('cancelled product change task cannot be reactivated')
    expect(migration).toContain('existing_action.change_application_id = v_application.id')
    expect(migration).toContain("existing_task.status = 'cancelled'")
    expect(migration).toContain('set content_locked_at = coalesce(content_locked_at, now())')
    expect(migration).toContain("private.record_mutation_audit('product_change_task')")
    expect(migration).toContain("'announcement', 'change_application'")
  })

  it('adds reversible change application archiving with automatic terminal-state handling', () => {
    const migration = readMigration('20260717123840_change_application_archiving.sql')

    expect(migration).toContain('add column archived_at timestamptz')
    expect(migration).toContain('change_applications_archive_state_check')
    expect(migration).toContain('change_applications_archive_reason_length_check')
    expect(migration).toContain('create or replace function private.sync_change_application_archive()')
    expect(migration).toContain('after update of status on public.product_change_tasks')
    expect(migration).toContain("new.status in ('completed', 'not_applicable')")
    expect(migration).toContain("new.status = 'pending'")
    expect(migration).toContain('create or replace function public.archive_change_application')
    expect(migration).toContain('create or replace function public.restore_change_application')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('revoke all on function private.sync_change_application_archive() from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.archive_change_application(uuid, text) to authenticated')
    expect(migration).toContain("task.status in ('completed', 'not_applicable')")
    expect(migration).not.toContain('delete from public.change_applications')
  })

  it('adds boolean-returning try_add_* assignment RPCs alongside the untouched legacy void RPCs', () => {
    const migration = readMigration('20260720110000_assignment_try_add_boolean.sql')

    expect(migration).toContain('create or replace function public.try_add_product_assignment')
    expect(migration).toContain('create or replace function public.try_add_duty_assignment')
    expect(migration).toContain('returns boolean')
    expect(migration).toContain("require_profile_role(p_user_id, 'member'")
    expect(migration).toContain('profile_is_active(p_user_id)')
    expect(migration).toContain('on conflict (user_id, product_id) do nothing')
    expect(migration).toContain('on conflict (user_id, duty_id) do nothing')
    expect(migration).toContain('return found')
    expect(migration).toContain("set search_path = ''")
    expect(migration).toContain('revoke all on function public.try_add_product_assignment(uuid, uuid) from public')
    expect(migration).toContain('revoke all on function public.try_add_product_assignment(uuid, uuid) from anon')
    expect(migration).toContain('grant execute on function public.try_add_product_assignment(uuid, uuid) to authenticated')
    expect(migration).toContain('revoke all on function public.try_add_duty_assignment(uuid, uuid) from public')
    expect(migration).toContain('revoke all on function public.try_add_duty_assignment(uuid, uuid) from anon')
    expect(migration).toContain('grant execute on function public.try_add_duty_assignment(uuid, uuid) to authenticated')
    // The legacy void RPCs are compatibility surface (D-06) and must not be dropped or redefined here.
    expect(migration).not.toContain('drop function public.add_product_assignment')
    expect(migration).not.toContain('drop function public.add_duty_assignment')
    expect(migration).not.toContain('create or replace function public.add_product_assignment')
    expect(migration).not.toContain('create or replace function public.add_duty_assignment')
  })

  it('adds bounded review bootstrap, cursor event paging, and leader-only server statistics v2', () => {
    const migration = readMigration('20260720120000_review_query_stats_v2.sql')

    expect(migration).toContain('create or replace function public.get_review_bootstrap_v2()')
    expect(migration).toContain('create or replace function public.list_review_events_page(')
    expect(migration).toContain('create or replace function public.get_review_statistics_v2(')
    expect(migration).toContain("set search_path = ''")

    // Bootstrap: single snapshot, bounded to pending + recent closed, latest relevant event only.
    expect(migration).toContain("'schema_version', 2")
    expect(migration).toContain("'snapshot_at', v_snapshot")
    expect(migration).toContain("'unread_count', v_unread")
    expect(migration).toContain('distinct on (event.review_request_id)')
    expect(migration).toContain('public.is_active_leader() or request.requester_id = v_actor_id')

    // Cursor paging: DESC by id, no OFFSET, limit clamped 1-100.
    expect(migration).toContain('order by event.id desc')
    expect(migration).toContain('limit greatest(1, least(coalesce(p_limit, 50), 100))')
    expect(migration).not.toContain('offset')
    expect(migration).toContain('public.is_active_leader() or request.requester_id = auth.uid()')

    // Statistics v2: leader-only, KST business-date boundary, pending vs month-end backlog separated.
    expect(migration).toContain('if not public.is_active_leader() then')
    expect(migration).toContain('private.sqa_business_date(event.occurred_at)')
    expect(migration).toContain("'pending_count', v_pending_count")
    expect(migration).toContain("'month_end_backlog', v_backlog")
    expect(migration).toContain('p_to - p_from > 366')

    // ACL: revoke public/anon, grant authenticated only. No existing object modified.
    expect(migration).toContain('revoke all on function public.get_review_bootstrap_v2() from public')
    expect(migration).toContain('revoke all on function public.get_review_bootstrap_v2() from anon')
    expect(migration).toContain('grant execute on function public.get_review_bootstrap_v2() to authenticated')
    expect(migration).toContain('revoke all on function public.list_review_events_page(uuid, bigint, integer) from public')
    expect(migration).toContain('revoke all on function public.list_review_events_page(uuid, bigint, integer) from anon')
    expect(migration).toContain('grant execute on function public.list_review_events_page(uuid, bigint, integer) to authenticated')
    expect(migration).toContain('revoke all on function public.get_review_statistics_v2(date, date, uuid, public.review_status) from public')
    expect(migration).toContain('revoke all on function public.get_review_statistics_v2(date, date, uuid, public.review_status) from anon')
    expect(migration).toContain('grant execute on function public.get_review_statistics_v2(date, date, uuid, public.review_status) to authenticated')
    expect(migration).not.toContain('drop function public.get_review_statistics(')
    expect(migration).not.toContain('drop table public.review_events')
    expect(migration).not.toContain('alter table public.review_requests drop')
  })

  it('adds bootstrap RPCs for core and change reference data in a single transaction snapshot', () => {
    const migration = readMigration('20260720130000_consistent_bootstrap_v2.sql')

    expect(migration).toContain('create or replace function public.get_core_bootstrap_v2()')
    expect(migration).toContain('create or replace function public.get_change_bootstrap_v2()')
    expect(migration.match(/security definer/g)?.length ?? 0).toBeGreaterThanOrEqual(2)
    expect(migration.match(/set search_path = ''/g)?.length ?? 0).toBeGreaterThanOrEqual(2)

    // SET TRANSACTION inside a function body is invalid for PostgREST RPC calls;
    // consistency is delivered by the follow-up single-statement rewrite
    // (20260720150000). This migration must not reintroduce the invalid pattern.
    expect(migration).not.toContain('set transaction isolation level')

    // Shared envelope contract (docs/ARCHITECTURE.md, Bootstrap snapshot contract):
    // schema_version/snapshot_at/data/warnings, reusing the review bootstrap design.
    expect(migration.match(/'schema_version', 1/g)?.length).toBe(2)
    expect(migration.match(/'snapshot_at', v_snapshot/g)?.length).toBe(2)
    expect(migration.match(/'warnings', '\[\]'::jsonb/g)?.length).toBe(2)
    expect(migration).toContain("'data', jsonb_build_object(")
    expect(migration).toContain("'profiles', v_profiles,")
    expect(migration).toContain("'change_applications', v_change_applications,")

    // get_core_bootstrap_v2: every select mirrors its existing RLS policy predicate exactly.
    expect(migration).toContain('where profile.id = v_actor_id or v_is_leader')
    expect(migration).toContain('select 1 from public.product_assignments pa')
    expect(migration).toContain('where pa.product_id = product.id and pa.user_id = v_actor_id')
    expect(migration).toContain('where assignment.user_id = v_actor_id or v_is_leader')

    // get_change_bootstrap_v2: mirrors change_applications_select_app_user /
    // change_action_items_select_app_user / product_change_tasks_select_relevant,
    // and reuses the existing SECURITY DEFINER directory RPCs rather than duplicating them.
    expect(migration).toContain("application.published_at is not null and application.status in ('published', 'cancelled')")
    expect(migration).toContain("and (task.status = 'pending' or task.updated_at >= v_snapshot - interval '6 months')")
    expect(migration).toContain('from public.list_change_application_product_scope() scope')
    expect(migration).toContain('from public.list_change_application_assignees() assignee')

    // ACL: revoke public/anon, grant authenticated only. No existing object modified (D-06).
    expect(migration).toContain('revoke all on function public.get_core_bootstrap_v2() from public')
    expect(migration).toContain('revoke all on function public.get_core_bootstrap_v2() from anon')
    expect(migration).toContain('grant execute on function public.get_core_bootstrap_v2() to authenticated')
    expect(migration).toContain('revoke all on function public.get_change_bootstrap_v2() from public')
    expect(migration).toContain('revoke all on function public.get_change_bootstrap_v2() from anon')
    expect(migration).toContain('grant execute on function public.get_change_bootstrap_v2() to authenticated')
    expect(migration).not.toContain('drop function public.get_core_bootstrap_v2')
    expect(migration).not.toContain('drop function public.get_change_bootstrap_v2')
    expect(migration).not.toContain('alter table public.profiles drop')
    expect(migration).not.toContain('alter table public.change_applications drop')
  })

  it('adds master OCC RPCs with a required authoritative-audit reason', () => {
    const migration = readMigration('20260720140000_master_occ_audit_reasons.sql')

    // Product/duty/duty-major-category update OCC.
    expect(migration).toContain('create or replace function public.update_product_if_current(')
    expect(migration).toContain('create or replace function public.update_duty_if_current(')
    expect(migration).toContain('create or replace function public.update_duty_major_category_if_current(')

    // Invite/profile active OCC. Last-active-leader guard is untouched.
    expect(migration).toContain('create or replace function public.update_allowed_user_if_current(')
    expect(migration).toContain('create or replace function public.set_profile_active_if_current(')
    expect(migration).toContain('add column if not exists updated_at timestamptz')
    expect(migration).toContain('allowed_users_set_updated_at')
    expect(migration).not.toContain('create or replace function public.guard_last_active_leader_profile')
    expect(migration).not.toContain('create or replace function public.guard_last_active_leader_allowed_user')

    // Assignment replacement revision (mirrors replace_project_assignments_if_current).
    expect(migration).toContain('create or replace function public.replace_product_assignments_if_current(')
    expect(migration).toContain('create or replace function public.replace_duty_assignments_if_current(')
    expect(migration).toContain('p_expected_updated_at timestamptz')
    expect(migration).toContain('set updated_at = clock_timestamp()')

    // Every _if_current RPC: active leader, FOR UPDATE, expected-revision compare,
    // required reason, distinct not-found vs. stale, empty search_path.
    expect(migration.match(/for update/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(migration.match(/SQA_MASTER_NOT_FOUND/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(migration.match(/SQA_MASTER_STALE/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(migration.match(/SQA_REASON_REQUIRED/g)?.length ?? 0).toBeGreaterThanOrEqual(5)
    expect(migration.match(/set search_path = ''/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(migration).toContain("perform set_config('sqa.audit_reason', v_reason, true)")
    expect(migration).toContain("perform set_config('sqa.audit_correlation_id', p_correlation_id::text, true)")

    // No-op distinguished from 0-row: a found-but-unchanged record returns without
    // running the UPDATE (and therefore without a private audit row).
    expect(migration).toContain('if not v_changed then')
    expect(migration).toContain('if v_profile.is_active is not distinct from p_is_active then')

    // Expand release: the deployed client keeps its active-leader direct write
    // path until a later, independently deployable contract migration.
    expect(migration).toContain('grant insert, update, delete on table')
    expect(migration).toContain('grant update on table public.profiles to authenticated')
    expect(migration).not.toContain('revoke update on table public.products from authenticated')
    expect(migration).not.toContain('drop policy if exists "products_write_leader" on public.products')
    expect(migration).not.toContain('drop policy if exists "profiles_update_leader" on public.profiles')

    // ACL: revoke public/anon, grant authenticated only.
    expect(migration).toContain('revoke all on function public.update_product_if_current(uuid, timestamptz, text, text, text, text, integer, text, uuid) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.update_product_if_current(uuid, timestamptz, text, text, text, text, integer, text, uuid) to authenticated')
    expect(migration).toContain('revoke all on function public.set_profile_active_if_current(uuid, timestamptz, boolean, text, uuid) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.set_profile_active_if_current(uuid, timestamptz, boolean, text, uuid) to authenticated')
    expect(migration).toContain('revoke all on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz) from public, anon, authenticated')
    expect(migration).toContain('grant execute on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz) to authenticated')

    // D-06: legacy void RPCs remain untouched compatibility surface.
    expect(migration).not.toContain('drop function public.replace_product_assignments')
    expect(migration).not.toContain('drop function public.replace_duty_assignments')
    expect(migration).not.toContain('create or replace function public.replace_product_assignments(')
    expect(migration).not.toContain('create or replace function public.replace_product_assignments_with_reason(')
    expect(migration).not.toContain('create or replace function public.replace_duty_assignments(')
  })

  it('rewrites bootstrap RPCs as single-statement RETURN SELECT assemblies', () => {
    const migration = readMigration('20260720150000_single_statement_bootstraps.sql')
    expect(migration).toContain('create or replace function public.get_review_bootstrap_v2()')
    expect(migration).toContain('create or replace function public.get_core_bootstrap_v2()')
    expect(migration).toContain('create or replace function public.get_change_bootstrap_v2()')
    expect(migration.match(/return \(/g)?.length ?? 0).toBeGreaterThanOrEqual(3)
    expect(migration).not.toContain('set transaction isolation level')
    expect(migration).toContain("'snapshot_at'")
  })

  it('adds profile-role OCC and audited assignment replacement', () => {
    const migration = readMigration('20260720160000_master_occ_role_assign_audit.sql')
    expect(migration).toContain('create or replace function public.set_profile_role_if_current(')
    expect(migration).toContain('p_reason text')
    expect(migration).toContain('p_correlation_id uuid')
    expect(migration).toContain("perform set_config('sqa.audit_reason'")
    expect(migration).toContain('drop function if exists public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz)')
    expect(migration).toContain('create or replace function public.replace_product_assignments_if_current(')
    expect(migration).toContain('create or replace function public.replace_duty_assignments_if_current(')
    expect(migration).toContain('grant execute on function public.set_profile_role_if_current(uuid, timestamptz, public.app_role, text, uuid) to authenticated')
    expect(migration).toContain('grant execute on function public.replace_product_assignments_if_current(uuid, uuid[], text, timestamptz, text, uuid) to authenticated')
  })

  it('canonicalizes assignment replacement member sets for true no-op', () => {
    const migration = readMigration('20260720170000_assignment_replace_set_noop.sql')
    expect(migration).toContain('array_agg(distinct x order by x)')
    expect(migration).toContain('create or replace function public.replace_product_assignments_if_current(')
    expect(migration).toContain('create or replace function public.replace_duty_assignments_if_current(')
  })

  it('corrects review-stat scope invariants and makes active leader membership required-snapshot data', () => {
    const migration = readMigration('20260720161117_fix_review_stats_and_leader_snapshot.sql')
    expect(migration).toContain("request.created_at >= (p_from::timestamp at time zone 'Asia/Seoul')")
    expect(migration).toContain('create index if not exists review_requests_created_at_idx')
    expect(migration).toContain("'{requester_breakdown}'")
    expect(migration).toContain("'requester_inactive'")
    expect(migration).toContain("'{data,leader_profiles}'")
    expect(migration).toContain("'{schema_version}', '2'::jsonb")
    expect(migration).toContain('if auth.uid() is null or not public.is_active_leader()')
    expect(migration).toContain('if auth.uid() is null or not public.can_use_app()')
    expect(migration).toContain('revoke all on function public.get_review_statistics_v2')
    expect(migration).toContain('revoke all on function public.get_core_bootstrap_v2() from public')
  })

  it('advances parent OCC revisions only for real add-only assignment inserts', () => {
    const migration = readMigration('20260720180000_bump_assignment_parent_revisions.sql')
    expect(migration).toContain('create or replace function public.try_add_product_assignment(')
    expect(migration).toContain('create or replace function public.try_add_duty_assignment(')
    expect(migration).toContain('v_inserted := found')
    expect(migration).toContain('if v_inserted then')
    expect(migration).toContain('update public.products set updated_at = clock_timestamp()')
    expect(migration).toContain('update public.duties set updated_at = clock_timestamp()')
    expect(migration).toContain('if auth.uid() is null or not public.is_active_leader()')
    expect(migration).toContain('grant execute on function public.try_add_product_assignment(uuid, uuid) to authenticated')
  })

  it('keeps allowed-user policies gated by active leader access after the OCC split', () => {
    const migration = readMigration('20260720190000_harden_allowed_user_policies.sql')
    expect(migration.match(/public\.is_active_leader\(\)/g)).toHaveLength(5)
    expect(migration).not.toContain('public.is_leader()')
    expect(migration).toContain('drop policy if exists "allowed_users_leader_all"')
    expect(migration).toContain('create policy "allowed_users_update_leader_compat"')
    expect(migration).toContain('grant update on table public.allowed_users to authenticated')
  })

  it('updates invite and linked profile role atomically under active-leader authorization', () => {
    const migration = readMigration('20260720200000_atomic_invite_occ.sql')
    expect(migration).toContain('auth.uid() is null or not public.is_active_leader()')
    expect(migration).toContain('lower(v_invite.email::text)')
    expect(migration).toContain('for update')
    expect(migration).toContain('update public.allowed_users')
    expect(migration).toContain('update public.profiles')
    expect(migration.indexOf('update public.profiles')).toBeGreaterThan(migration.indexOf('update public.allowed_users'))
    expect(migration).toContain('grant execute on function public.update_allowed_user_if_current')
  })

  it('returns all statistics page aggregates from one statement snapshot', () => {
    const migration = readMigration('20260720210000_single_snapshot_review_stats.sql')
    expect(migration).toContain('private.get_review_statistics_v2_single_scope')
    expect(migration).not.toContain('private.get_review_statistics_v2_legacy')
    expect(migration).toContain('monthly_event_counts as (')
    expect(migration).toContain("event.occurred_at at time zone 'Asia/Seoul'")
    expect(migration).toContain("'{monthly_breakdown}'")
    expect(migration).toContain('generate_series(')
    expect(migration).not.toContain('set transaction isolation level')
  })

  it('exposes review event bigint cursors as exact decimal strings', () => {
    const migration = readMigration('20260720220000_review_event_text_cursor.sql')
    expect(migration).toContain('create function public.list_review_events_page_v2(')
    expect(migration).toContain('p_before_id text')
    expect(migration).toContain("'id', page.id::text")
    expect(migration).toContain('event.id < v_before_id')
    expect(migration).not.toContain(' offset ')
  })

  it('adds hardened mutation surfaces without breaking the deployed client during expand rollout', () => {
    const migration = readMigration('20260720230000_full_code_review_hardening.sql')
    expect(migration).toContain('revoke all on function public.replace_project_assignments(uuid, uuid[]) from public, anon')
    expect(migration).toContain('grant execute on function public.replace_project_assignments(uuid, uuid[]) to authenticated')
    expect(migration).toContain('grant execute on function public.add_product_assignment(uuid, uuid) to authenticated')
    expect(migration).not.toContain('revoke execute on function public.replace_project_assignments(uuid, uuid[]) from authenticated')
    expect(migration).toContain('v_inserted := found')
    expect(migration).toContain('if v_inserted then')
    expect(migration).toContain('grant insert on table public.profile_notes, public.activity_logs to authenticated')
    expect(migration).toContain('create function public.list_audit_events_v2(')
    expect(migration).toContain('event.id::text')
    expect(migration).toContain('create or replace function private.delete_versioned_row(')
    expect(migration).toContain('get diagnostics v_row_count = row_count')
    expect(migration).toContain('grant delete on table public.products')
    expect(migration).toContain('create or replace function public.get_change_bootstrap_v2()')
    expect(migration).toContain('limit 1001')
    expect(migration).toContain('limit 5001')
    expect(migration).toContain('limit 1000')
    expect(migration).toContain('limit 5000')
    expect(migration).toContain('SQA_CHANGE_APPLICATIONS_TRUNCATED')
    expect(migration).toContain('SQA_CHANGE_ACTION_ITEMS_TRUNCATED')
    expect(migration).toContain('SQA_PRODUCT_CHANGE_TASKS_TRUNCATED')
  })

  it('keeps the leader directory API while replacing its definer view with an invoker view', () => {
    const migration = readMigration('20260720231000_harden_leader_directory_view.sql')
    expect(migration).toContain('create or replace function private.list_active_leader_profiles()')
    expect(migration).toContain("security definer\nset search_path = ''")
    expect(migration).toContain('public.can_use_app()')
    expect(migration).toContain('with (security_invoker = true, security_barrier = true)')
    expect(migration).toContain('from private.list_active_leader_profiles() leader')
    expect(migration).toContain('grant execute on function private.list_active_leader_profiles()')
    expect(migration).toContain('grant select on table public.public_leader_profiles')
  })

  it('persists all-products application completion separately from exception processing', () => {
    const migration = readMigration('20260722120452_distinguish_fully_applied_change.sql')

    expect(migration).toContain('create or replace function private.sync_change_application_archive()')
    expect(migration).toContain("task.status not in ('completed', 'cancelled')")
    expect(migration).toContain('모든 제품 적용이 완료되어 자동 보관됨')
    expect(migration).toContain('모든 제품 적용업무가 처리되어 자동 보관됨')
    expect(migration).toContain("'completion_kind'")
    expect(migration).toContain("'all_applied'")
    expect(migration).toContain("'processed_with_exceptions'")
    expect(migration).toContain("application.archive_origin = 'automatic'")
    expect(migration).toContain('revoke all on function private.sync_change_application_archive()')
  })
})
