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
})
