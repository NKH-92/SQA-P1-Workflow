import { describe, expect, it } from 'vitest'

const scripts = import.meta.glob('../scripts/**/*.{ps1,mjs,sql,json}', {
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
    const canonicalSql = [
      'sql/verify/00_migration_history.sql',
      'sql/verify/10_assignment_security.sql',
      'sql/verify/20_review_workflow.sql',
      'sql/verify/30_announcement_contract.sql',
      'sql/verify/40_change_application_contract.sql',
      'sql/verify/50_audit_v3.sql',
    ].map(readScript).join('\n')
    const manifest = readScript('sql/verify/manifest.json')

    expect(script).toContain("'db', 'query'")
    expect(script).not.toContain('db execute')
    expect(script).toContain("sql\\verify\\manifest.json")
    expect(script).toContain('validate-readiness-manifest.mjs')
    expect(script).not.toContain('$verificationSql = @"')
    expect(canonicalSql).toContain('add_product_assignment')
    expect(canonicalSql).toContain('add_duty_assignment')
    expect(canonicalSql).toContain('replace_project_assignments_if_current')
    expect(canonicalSql).toContain("raise exception 'SQA_DB_READY_")
    expect(canonicalSql).toContain("to_regclass('public.announcements')")
    expect(canonicalSql).toContain('announcements_pin_state_check')
    expect(canonicalSql).toContain('private.enforce_announcement_invariants()')
    expect(canonicalSql).toContain('announcements_select_app_user')
    expect(canonicalSql).toContain('count(*) = 16')
    expect(canonicalSql).toContain('private.build_audit_business_snapshot(text,jsonb)')
    expect(canonicalSql).toContain('public.list_audit_events(integer,bigint)')
    expect(manifest).toContain('20260718161549')
    expect(script).toContain("SupabaseCliVersion = '2.109.1'")
    expect(script).toContain('function Invoke-SupabaseCommand')
    expect(script).toContain('$nativeExitCode = $LASTEXITCODE')
    expect(script).toContain("SQA_SUPABASE_NATIVE_FAILED: $Operation exited with code $nativeExitCode")
    expect(script).toContain("-Operation 'link'")
    expect(script).toContain("-Operation 'db-push'")
    expect(script).toContain('-Operation "readiness-$readinessFileName"')
    expect(script).not.toContain('npx --yes "supabase@$SupabaseCliVersion" link')
    expect(script).not.toContain('npx --yes "supabase@$SupabaseCliVersion" db push')
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
