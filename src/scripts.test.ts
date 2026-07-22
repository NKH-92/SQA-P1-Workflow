import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const scripts = import.meta.glob('../scripts/**/*.{ps1,mjs,sql,json}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

function readScript(name: string) {
  return scripts[`../scripts/${name}`] ?? ''
}

const root = resolve(import.meta.dirname, '..')

function runFixtureScript(name: string, url: string) {
  const secretSentinel = 'fixture-secret-must-not-leak'
  const result = spawnSync(process.execPath, [resolve(root, 'scripts', name)], {
    cwd: root,
    encoding: 'utf8',
    env: {
      ...process.env,
      SUPABASE_URL: url,
      SUPABASE_ANON_KEY: 'fixture-anon-must-not-leak',
      SUPABASE_SERVICE_ROLE_KEY: secretSentinel,
      RLS_SCALE_USER_ID: '00000000-0000-0000-0000-000000000001',
    },
  })
  return {
    status: result.status,
    output: `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    secretSentinel,
  }
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
    expect(canonicalSql).toContain('public.list_audit_events_v2(integer,text)')
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
    expect(fixtures).toContain("RLS_ALLOW_REMOTE_DISPOSABLE === '1'")
    expect(fixtures).toContain("RLS_CONFIRM_DISPOSABLE_TARGET === 'true'")
    expect(fixtures).toContain('targetHostname === `${targetProjectRef}.supabase.co`')
    expect(fixtures).toContain('targetProjectRef !== productionProjectRef')
    expect(fixtures).toContain('allowedTargetRefs.includes(targetProjectRef)')

    const remoteSmoke = readScript('run-dr-remote-smoke.mjs')
    expect(remoteSmoke).toContain("RLS_ALLOW_REMOTE_DISPOSABLE: '1'")
    expect(remoteSmoke).toContain('RLS_CONFIRM_DISPOSABLE_TARGET: confirmDisposableTarget')
    expect(remoteSmoke).toContain('RLS_REMOTE_TARGET_REF: targetProjectRef')
    expect(remoteSmoke).toContain('RLS_PRODUCTION_PROJECT_REF: productionProjectRef')
    expect(remoteSmoke).toContain('RLS_ALLOWED_TARGET_REFS: allowedTargetRefs')
  })

  it.each(['setup-rls-fixtures.mjs', 'seed-review-scale-fixture.mjs'])(
    '%s rejects every non-local or malformed Supabase target before using credentials',
    (name) => {
      for (const target of [
        'https://project-ref.supabase.co',
        'http://localhost.attacker.example:54321',
        'http://127.0.0.1.attacker.example:54321',
        'http://[::1]:54321',
      ]) {
        const result = runFixtureScript(name, target)
        expect(result.status).not.toBe(0)
        expect(result.output).toContain('SQA_FIXTURE_NON_LOCAL_TARGET')
        expect(result.output).not.toContain(result.secretSentinel)
      }

      const malformed = runFixtureScript(name, 'not a URL')
      expect(malformed.status).not.toBe(0)
      expect(malformed.output).toContain('SQA_FIXTURE_TARGET_URL_INVALID')
      expect(malformed.output).not.toContain(malformed.secretSentinel)

      const script = readScript(name)
      expect(script).toContain("'localhost'")
      expect(script).toContain("'127.0.0.1'")
      expect(script.indexOf('new URL(url)')).toBeLessThan(script.indexOf('createClient(url,'))
    },
  )
})
