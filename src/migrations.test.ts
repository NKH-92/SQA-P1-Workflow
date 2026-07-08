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
})
