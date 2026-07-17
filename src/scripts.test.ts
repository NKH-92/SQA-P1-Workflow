import { describe, expect, it } from 'vitest'

const scripts = import.meta.glob('../scripts/*.{ps1,mjs}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function readScript(name: string) {
  return scripts[`../scripts/${name}`] ?? ''
}

describe('migration scripts', () => {
  it('apply-pending-migrations.ps1 uses db query not db execute', () => {
    const script = readScript('apply-pending-migrations.ps1')

    expect(script).toContain('db query')
    expect(script).not.toContain('db execute')
    expect(script).toContain('add_product_assignment')
    expect(script).toContain('add_duty_assignment')
    expect(script).toContain('replace_project_assignments_if_current')
    expect(script).toContain('assignment_rpc_security_ok')
    expect(script).toContain('review_activity_transaction_ok')
    expect(script).toContain('active_leader_password_gate_ok')
    expect(script).toContain('profile_note_private_audit_ok')
    expect(script).toContain('announcement_board_ok')
    expect(script).toContain("to_regclass('public.announcements')")
    expect(script).toContain('announcements_pin_state_check')
    expect(script).toContain('announcements_private_audit')
    expect(script).toContain('private.enforce_announcement_invariants()')
    expect(script).toContain('announcements_select_app_user')
    expect(script).toContain("qual like '%is_active_self()%'")
    expect(script).toContain("qual not like '%can_use_app()%'")
    expect(script).toContain('announcements_insert_leader')
    expect(script).toContain('announcements_update_leader')
    expect(script).toContain('announcements_delete_leader')
    expect(script).toContain("'pinned_at', 'UPDATE'")
    expect(script).toContain('latest_migration_version_ok')
    expect(script).toContain("version = '20260716200422'")
    expect(script).toContain('count(*) >= 13')
    expect(script).not.toContain("proacl::text not like '%=X%'")
    expect(script).toContain("SupabaseCliVersion = '2.109.1'")
  })

  it('backup-db.ps1 dumps schema and data separately', () => {
    const script = readScript('backup-db.ps1')

    expect(script).toContain('-schema.sql')
    expect(script).toContain('-data.sql')
    expect(script).toContain('--data-only')
  })

  it('generate-p1-product-seed.mjs reads CSV/JSON inputs instead of src/data', () => {
    const script = readScript('generate-p1-product-seed.mjs')
    expect(script).toContain('readCsvRows')
    expect(script).toContain('readProfileMap')
    expect(script).not.toContain('src/data/p1ProductAllocation.ts')
    expect(script).not.toContain('Function(')
  })

  it('generate-p1-duty-seed.mjs reads CSV/JSON inputs instead of src/data', () => {
    const script = readScript('generate-p1-duty-seed.mjs')
    expect(script).toContain('readCsvRows')
    expect(script).toContain('readProfileMap')
    expect(script).not.toContain('src/data/p1DutyAllocation.ts')
    expect(script).not.toContain('Function(')
  })

  it('enforces explicit JavaScript chunk and gzip budgets after build', () => {
    const script = readScript('check-bundle-budget.mjs')
    expect(script).toContain('MAX_CHUNK_BYTES')
    expect(script).toContain('MAX_TOTAL_GZIP_BYTES')
    expect(script).toContain("gzipSync")
  })

  it('renders a project-specific Supabase CSP for production builds', () => {
    const script = readScript('render-security-headers.mjs')
    expect(script).toContain('VITE_SUPABASE_URL')
    expect(script).toContain('https://*.supabase.co')
    expect(script).toContain('wss://*.supabase.co')
    expect(script).toContain('must use HTTPS')
  })

  it('makes the dedicated RLS command fail closed and seeds deterministic Auth fixtures', () => {
    const runner = readScript('run-rls-tests.mjs')
    const fixtures = readScript('setup-rls-fixtures.mjs')
    expect(runner).toContain("RLS_REQUIRED: '1'")
    expect(fixtures).toContain('admin.auth.admin.createUser')
    expect(fixtures).toContain('must_change_password: user.mustChangePassword ?? false')
    expect(fixtures).toContain('RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID')
    expect(fixtures).toContain('RLS_TEST_PROJECT_UPDATED_AT')
  })
})
