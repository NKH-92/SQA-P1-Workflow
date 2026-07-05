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
})
