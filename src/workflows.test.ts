import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const workflowDirectory = resolve(root, '.github/workflows')
const verifyDirectory = resolve(root, 'scripts/sql/verify')

function workflow(name: string) {
  return readFileSync(resolve(workflowDirectory, name), 'utf8').replace(/\r\n/g, '\n')
}

function requiredStepIndex(source: string, name: string) {
  const index = source.indexOf(`- name: ${name}`)
  if (index < 0) throw new Error(`SQA_WORKFLOW_STEP_MISSING: ${name}`)
  return index
}

function workflowDispatchInput(source: string, name: string) {
  const marker = `      ${name}:\n`
  const markerIndex = source.indexOf(marker)
  if (markerIndex < 0) throw new Error(`SQA_WORKFLOW_INPUT_MISSING: ${name}`)
  const valueStart = markerIndex + marker.length
  const remaining = source.slice(valueStart)
  const nextInputIndex = remaining.search(/^ {6}[a-zA-Z0-9_-]+:\s*$/m)
  return nextInputIndex < 0 ? remaining : remaining.slice(0, nextInputIndex)
}

type SecretUse = { job: string; step: string; secret: string }

function secretInventory(source: string): SecretUse[] {
  const inventory: SecretUse[] = []
  let inJobs = false
  let job = ''
  let step = ''
  for (const line of source.split('\n')) {
    if (line === 'jobs:') {
      inJobs = true
      continue
    }
    if (!inJobs) continue
    const jobMatch = line.match(/^ {2}([a-zA-Z0-9_-]+):\s*$/)
    if (jobMatch) {
      job = jobMatch[1]
      step = ''
    }
    const stepMatch = line.match(/^ {6}- name:\s*(.+)$/)
    if (stepMatch) step = stepMatch[1]
    for (const match of line.matchAll(/secrets\.([A-Z0-9_]+)/g)) {
      inventory.push({ job, step, secret: match[1] })
    }
  }
  return inventory.sort((left, right) =>
    `${left.job}|${left.step}|${left.secret}`.localeCompare(`${right.job}|${right.step}|${right.secret}`),
  )
}

function assertSecretScope(source: string, expected: SecretUse[]) {
  if (/^\s*secrets:\s*inherit\s*$/m.test(source)) {
    throw new Error('SQA_WORKFLOW_SECRET_INHERIT')
  }
  const actual = secretInventory(source)
  const sortedExpected = [...expected].sort((left, right) =>
    `${left.job}|${left.step}|${left.secret}`.localeCompare(`${right.job}|${right.step}|${right.secret}`),
  )
  expect(actual).toEqual(sortedExpected)
  if (actual.some((item) => !item.step)) throw new Error('SQA_WORKFLOW_JOB_LEVEL_SECRET')
}

const migrateSecrets: SecretUse[] = [
  { job: 'migrate', step: 'Check secret', secret: 'SUPABASE_ACCESS_TOKEN' },
  { job: 'migrate', step: 'Check secret', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Check secret', secret: 'SUPABASE_PROJECT_REF' },
  { job: 'migrate', step: 'Guard migration history', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'List migration status (before)', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Guard Stage B Storage handoff', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Push pending migrations', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Verify production DB readiness from canonical SQL', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Deploy account Edge Functions', secret: 'SUPABASE_ACCESS_TOKEN' },
  { job: 'migrate', step: 'Deploy account Edge Functions', secret: 'SUPABASE_PROJECT_REF' },
  { job: 'migrate', step: 'Verify account Edge Functions', secret: 'SUPABASE_ACCESS_TOKEN' },
  { job: 'migrate', step: 'Verify account Edge Functions', secret: 'SUPABASE_PROJECT_REF' },
]

const deploySecrets: SecretUse[] = [
  { job: 'deploy', step: 'Check deploy configuration', secret: 'CLOUDFLARE_API_TOKEN' },
  { job: 'deploy', step: 'Check deploy configuration', secret: 'SUPABASE_DB_URL' },
  { job: 'deploy', step: 'Check deploy configuration', secret: 'VITE_SUPABASE_ANON_KEY' },
  { job: 'deploy', step: 'Verify production DB readiness from canonical SQL', secret: 'SUPABASE_DB_URL' },
  { job: 'deploy', step: 'Verify Supabase public configuration', secret: 'VITE_SUPABASE_ANON_KEY' },
  { job: 'deploy', step: 'Build', secret: 'VITE_SUPABASE_ANON_KEY' },
  { job: 'deploy', step: 'Deploy to Cloudflare Workers', secret: 'CLOUDFLARE_API_TOKEN' },
]

const backupSecrets: SecretUse[] = [
  { job: 'backup', step: 'Check backup secrets', secret: 'BACKUP_PASSPHRASE' },
  { job: 'backup', step: 'Check backup secrets', secret: 'SUPABASE_DB_URL' },
  { job: 'backup', step: 'Dump DR package', secret: 'SUPABASE_DB_URL' },
  { job: 'backup', step: 'Encrypt and revalidate DR package', secret: 'BACKUP_PASSPHRASE' },
]

const drRehearsalSecrets: SecretUse[] = [
  { job: 'rehearsal', step: 'Check target safety', secret: 'DR_PRODUCTION_PROJECT_REF' },
  { job: 'rehearsal', step: 'Download and decrypt source package', secret: 'BACKUP_PASSPHRASE' },
  { job: 'rehearsal', step: 'Capture target evidence', secret: 'DR_TARGET_DB_URL' },
  { job: 'rehearsal', step: 'Run restored-project Auth and RLS smoke', secret: 'DR_PRESERVED_USER_EMAIL' },
  { job: 'rehearsal', step: 'Run restored-project Auth and RLS smoke', secret: 'DR_PRESERVED_USER_ID' },
  { job: 'rehearsal', step: 'Run restored-project Auth and RLS smoke', secret: 'DR_PRESERVED_USER_PASSWORD' },
  { job: 'rehearsal', step: 'Run restored-project Auth and RLS smoke', secret: 'DR_PRODUCTION_PROJECT_REF' },
  { job: 'rehearsal', step: 'Run restored-project Auth and RLS smoke', secret: 'DR_TARGET_ANON_KEY' },
  { job: 'rehearsal', step: 'Run restored-project Auth and RLS smoke', secret: 'DR_TARGET_SERVICE_ROLE_KEY' },
  { job: 'rehearsal', step: 'Run restored-project Auth and RLS smoke', secret: 'DR_TARGET_SUPABASE_URL' },
]

describe('workflow security contracts', () => {
  it('pins every external action to a full commit SHA', () => {
    for (const file of readdirSync(workflowDirectory).filter((name) => name.endsWith('.yml'))) {
      const externalUses = [...workflow(file).matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)]
        .map((match) => match[1])
        .filter((value) => !value.startsWith('./'))
      for (const value of externalUses) {
        expect(value, `${file}: ${value}`).toMatch(/@[0-9a-f]{40}$/)
      }
    }
  })

  it('uses one blocking reusable RLS workflow in CI and deployment', () => {
    const ci = workflow('ci.yml')
    const deploy = workflow('deploy-worker.yml')
    const reusable = workflow('reusable-rls.yml')

    expect(ci).toContain('rls:\n    uses: ./.github/workflows/reusable-rls.yml')
    expect(ci).toContain('e2e:\n    runs-on: ubuntu-latest')
    expect(ci).toContain('run: npm run test:e2e')
    expect(ci).toContain('e2e-remote:')
    expect(ci).toContain('run: npm run test:e2e:remote')
    expect(ci).toContain('needs: [typecheck, lint, test, rls, e2e, e2e-remote]')
    expect(readFileSync(resolve(root, 'package.json'), 'utf8')).toContain('"test:e2e:remote"')
    const playwrightConfig = readFileSync(resolve(root, 'playwright.config.ts'), 'utf8')
    expect(playwrightConfig).toContain("name: 'preview'")
    expect(playwrightConfig).toContain("name: 'remote'")
    expect(playwrightConfig).toContain('REMOTE_E2E_REQUIRED')
    expect(existsSync(resolve(root, 'scripts/run-remote-e2e.mjs'))).toBe(true)
    expect(existsSync(resolve(root, 'tests/e2e/remote/remote-workflows.spec.ts'))).toBe(true)
    const remoteRunner = readFileSync(resolve(root, 'scripts/run-remote-e2e.mjs'), 'utf8')
    expect(remoteRunner).toContain('REMOTE_E2E_UNINVITED_EMAIL')
    expect(remoteRunner).toContain("runSupabase(['migration', 'up', '--local', '--include-all'])")
    expect(remoteRunner).toContain("VITE_APP_MODE: 'remote'")
    expect(remoteRunner).toContain('VITE_SUPABASE_URL: status.API_URL')
    expect(remoteRunner).toContain('VITE_SUPABASE_ANON_KEY: status.ANON_KEY')
    expect(remoteRunner).not.toMatch(/migration',\s*'up'[\s\S]{0,80}allowFailure:\s*true/)
    expect(deploy).toContain('rls:\n    needs: guard\n    uses: ./.github/workflows/reusable-rls.yml')
    expect(deploy).toContain('deploy:\n    needs: rls')
    expect(reusable).toContain('npm run test:rls:full')
    expect(reusable).toContain('if: ${{ always() }}')
    expect(reusable).not.toContain('secrets.')

    // The canonical RLS gate seeds the scale fixture and activates the EXPLAIN suite.
    const rlsGate = readFileSync(resolve(root, 'scripts/run-local-rls-gate.mjs'), 'utf8')
    expect(rlsGate).toContain('seed-review-scale-fixture.mjs')
    expect(rlsGate).toContain("RLS_SCALE_ENABLED: '1'")
    expect(rlsGate).toContain('DATABASE_URL: status.DB_URL')
    expect(rlsGate).toContain('SQA_RLS_EXPECTED_LEGACY_REVIEW_INPUT_ROLLBACK')
    expect(rlsGate).toContain('SQA_RLS_CHANGED_INVALID_TITLE_ACCEPTED')
    expect(rlsGate).toContain('SQA_REVIEW_TITLE_INVALID')
    expect(rlsGate).toContain('assertLocalApiUrl(status.API_URL)')
    expect(existsSync(resolve(root, 'scripts/seed-review-scale-fixture.mjs'))).toBe(true)
    expect(existsSync(resolve(root, 'tests/rls/rls.review-query-scale.test.ts'))).toBe(true)
    const scaleTest = readFileSync(resolve(root, 'tests/rls/rls.review-query-scale.test.ts'), 'utf8')
    expect(scaleTest).toContain('bootstrap.data?.requests')
    expect(scaleTest).toContain("p_from: '2026-01-01'")
    expect(scaleTest).toContain("'supabase@2.109.1'")
    expect(scaleTest).toContain("'db',")
    expect(scaleTest).toContain("'query',")
    expect(scaleTest).toContain("'--local',")
    expect(scaleTest).toContain("'--file',")
    expect(scaleTest).toContain('review_read_receipts')
    expect(scaleTest).toContain('10_000')

    // Remote scenarios must not soft-skip required actions via locator.count() branches.
    const remoteSpec = readFileSync(resolve(root, 'tests/e2e/remote/remote-workflows.spec.ts'), 'utf8')
    expect(remoteSpec).toContain("test('R-E2E-01")
    expect(remoteSpec).toContain("test('R-E2E-12")
    expect(remoteSpec).toContain("test('R-E2E-13")
    expect(remoteSpec).not.toMatch(/if\s*\(\s*await\s+[^\n]*\.count\(\)/)
    expect(remoteSpec).toContain('requireVisible')
    expect(remoteRunner).toContain('REMOTE_E2E_HARDENED_OCC_REVIEW_REQUEST_ID')
    expect(remoteRunner).toContain('REMOTE_E2E_STATS_REVIEW_REQUEST_ID')
    expect(remoteRunner).toContain('REMOTE_E2E_TEST_PRODUCT_ID')
    expect(remoteRunner).toContain('REMOTE_E2E_LEADER_B_EMAIL')
  })

  it('keeps production branch, confirmation, backup, storage, and migration-history gates ordered', () => {
    const migrate = workflow('db-migrate.yml')
    const deploy = workflow('deploy-worker.yml')

    expect(requiredStepIndex(migrate, 'Require main branch'))
      .toBeLessThan(requiredStepIndex(migrate, 'Require a recent successful backup'))
    expect(requiredStepIndex(migrate, 'Require a recent successful backup'))
      .toBeLessThan(requiredStepIndex(migrate, 'Push pending migrations'))
    expect(requiredStepIndex(migrate, 'Guard migration history'))
      .toBeLessThan(requiredStepIndex(migrate, 'Guard Stage B Storage handoff'))
    expect(requiredStepIndex(migrate, 'Guard Stage B Storage handoff'))
      .toBeLessThan(requiredStepIndex(migrate, 'Push pending migrations'))
    expect(migrate).not.toMatch(/^\s*run:\s*supabase migration repair/m)
    expect(deploy).toContain('environment: production')
    expect(deploy).toContain('inputs.deploy_confirm != true')
    expect(deploy).toContain('db_migrate_run_id:')
    expect(deploy).toContain('actions: read')
    expect(deploy).toContain('.github/workflows/db-migrate.yml')
    expect(deploy).toContain('[ "$head_sha" != "$GITHUB_SHA" ]')
    expect(requiredStepIndex(deploy, 'Require a recent successful DB migration for this SHA'))
      .toBeLessThan(requiredStepIndex(deploy, 'Deploy to Cloudflare Workers'))
    expect(requiredStepIndex(deploy, 'Verify production DB readiness from canonical SQL'))
      .toBeLessThan(requiredStepIndex(deploy, 'Deploy to Cloudflare Workers'))
  })

  it('requires successful same-SHA main CI provenance before DB migration and deployment', () => {
    const migrate = workflow('db-migrate.yml')
    const deploy = workflow('deploy-worker.yml')
    const ciStep = 'Require a successful CI run for this SHA'

    for (const source of [migrate, deploy]) {
      const input = workflowDispatchInput(source, 'ci_run_id')
      expect(input).toContain('required: true')
      expect(input).toContain('type: string')
      expect(source).toContain('CI_RUN_ID: ${{ inputs.ci_run_id }}')
      expect(source).toContain('if ! [[ "$CI_RUN_ID" =~ ^[0-9]+$ ]]')
      expect(source).toContain('[ "$workflow_path" != ".github/workflows/ci.yml" ]')
      expect(source).toContain('[ "$event" != "push" ]')
      expect(source).toContain('[ "$head_branch" != "main" ]')
      expect(source).toContain('[ "$head_sha" != "$GITHUB_SHA" ]')
      expect(source).toContain('[ "$conclusion" != "success" ]')
    }

    expect(requiredStepIndex(migrate, 'Require main branch'))
      .toBeLessThan(requiredStepIndex(migrate, ciStep))
    expect(requiredStepIndex(migrate, ciStep))
      .toBeLessThan(requiredStepIndex(migrate, 'Require a recent successful backup'))
    expect(requiredStepIndex(migrate, ciStep))
      .toBeLessThan(requiredStepIndex(migrate, 'Check secret'))
    expect(requiredStepIndex(deploy, 'Require main branch'))
      .toBeLessThan(requiredStepIndex(deploy, ciStep))
    expect(requiredStepIndex(deploy, ciStep))
      .toBeLessThan(requiredStepIndex(deploy, 'Require a recent successful DB migration for this SHA'))
    expect(requiredStepIndex(deploy, 'Require a recent successful DB migration for this SHA'))
      .toBeLessThan(requiredStepIndex(deploy, 'Deploy to Cloudflare Workers'))
  })

  it('uses the exact readiness manifest in every database verification path', () => {
    for (const file of ['db-migrate.yml', 'deploy-worker.yml']) {
      const source = workflow(file)
      expect(source).toContain('validate-readiness-manifest.mjs')
      expect(source).toContain('scripts/sql/verify/manifest.json')
      expect(source).toContain('-v ON_ERROR_STOP=1')
      expect(source).not.toContain('scripts/sql/verify/[0-5][0-9]_*.sql')
    }
    const reusable = workflow('reusable-rls.yml')
    const runner = readFileSync(resolve(root, 'scripts/run-local-rls-gate.mjs'), 'utf8')
    const powershell = readFileSync(resolve(root, 'scripts/apply-pending-migrations.ps1'), 'utf8')
    expect(reusable).toContain('test:rls:full')
    expect(runner).toContain('validateReadinessManifest')
    expect(runner).toContain("name >= firstHeld")
    expect(runner).toContain("migration', 'up', '--local', '--include-all")
    expect(powershell).toContain('sql\\verify\\manifest.json')
  })

  it('retains migration, RLS, ACL, trigger, announcement, change, and audit invariants', () => {
    const manifest = JSON.parse(readFileSync(resolve(verifyDirectory, 'manifest.json'), 'utf8')) as {
      readinessFiles: string[]
      migrationVersions: string[]
    }
    const sql = manifest.readinessFiles
      .map((name) => readFileSync(resolve(verifyDirectory, name), 'utf8'))
      .join('\n')

    expect(manifest.migrationVersions).toContain('20260718161549')
    expect(manifest.migrationVersions).toContain('20260720110000')
    expect(manifest.migrationVersions).toContain('20260720120000')
    expect(manifest.migrationVersions).toContain('20260720130000')
    expect(manifest.migrationVersions).toContain('20260720150000')
    expect(manifest.migrationVersions).toContain('20260720160000')
    expect(manifest.migrationVersions).toContain('20260720161117')
    expect(manifest.migrationVersions).toContain('20260720170000')
    expect(manifest.migrationVersions).toContain('20260720180000')
    expect(manifest.migrationVersions).toContain('20260720200000')
    expect(manifest.migrationVersions).toContain('20260720210000')
    expect(manifest.migrationVersions).toContain('20260720220000')
    const migrationVersions = readdirSync(resolve(root, 'supabase/migrations'))
      .filter((name) => /^\d{12,14}_.+\.sql$/.test(name))
      .map((name) => name.split('_', 1)[0])
      .sort()
    expect(manifest.migrationVersions).toEqual(migrationVersions)
    expect(sql).toContain("to_regprocedure('public.set_profile_role_if_current(uuid,timestamptz,public.app_role,text,uuid)')")
    expect(sql).toContain("to_regprocedure('public.replace_product_assignments_if_current(uuid,uuid[],text,timestamptz,text,uuid)')")
    expect(sql).toContain("like '%return (%'")
    for (const invariant of [
      "to_regprocedure('public.add_product_assignment(uuid,uuid)')",
      "to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)')",
      "policyname = 'announcements_select_app_user'",
      "policyname = 'product_change_tasks_select_relevant'",
      "to_regprocedure('private.record_mutation_audit()')",
      'count(*) = 16',
      'search_path=pg_catalog, public, private, pg_temp',
      "tgenabled in ('O', 'A')",
      "to_regprocedure('public.get_review_bootstrap_v2()')",
      "to_regprocedure('public.list_review_events_page_v2(uuid,text,integer)')",
      "to_regprocedure('public.get_review_statistics_v2(date,date,uuid,public.review_status)')",
      "to_regprocedure('public.get_core_bootstrap_v2()')",
      "to_regprocedure('public.get_change_bootstrap_v2()')",
    ]) {
      expect(sql).toContain(invariant)
    }
    for (const file of manifest.readinessFiles) {
      expect(readFileSync(resolve(verifyDirectory, file), 'utf8')).toContain("raise exception 'SQA_DB_READY_")
    }
  })

  it('keeps production secrets scoped to the exact privileged steps', () => {
    assertSecretScope(workflow('db-migrate.yml'), migrateSecrets)
    assertSecretScope(workflow('deploy-worker.yml'), deploySecrets)
    assertSecretScope(workflow('reusable-rls.yml'), [])
  })

  it('rejects inherited, job-level, and unprivileged-step secret regressions', () => {
    expect(() => assertSecretScope(`${workflow('reusable-rls.yml')}\n    secrets: inherit\n`, []))
      .toThrow('SQA_WORKFLOW_SECRET_INHERIT')
    expect(() => assertSecretScope(
      workflow('deploy-worker.yml').replace(
        '  deploy:\n',
        '  deploy:\n    env:\n      SUPABASE_DB_URL: ${{ secrets.SUPABASE_DB_URL }}\n',
      ),
      deploySecrets,
    )).toThrow()
    expect(() => assertSecretScope(
      workflow('deploy-worker.yml').replace(
        '      - name: Install dependencies\n        run: npm ci',
        '      - name: Install dependencies\n        env:\n          TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\n        run: npm ci',
      ),
      deploySecrets,
    )).toThrow()
  })

  it('fails the ordering validator when a required step is removed', () => {
    const migrate = workflow('db-migrate.yml').replace('- name: Require main branch', '- name: Removed guard')
    expect(() => requiredStepIndex(migrate, 'Require main branch')).toThrow('SQA_WORKFLOW_STEP_MISSING')
  })

  it('keeps manual promotion, public configuration checks, and post-deploy health checks', () => {
    const deploy = workflow('deploy-worker.yml')
    expect(deploy).not.toMatch(/^\s*push:/m)
    expect(deploy).toContain('workflow_dispatch:')
    expect(requiredStepIndex(deploy, 'Verify Supabase public configuration'))
      .toBeLessThan(requiredStepIndex(deploy, 'Build'))
    expect(requiredStepIndex(deploy, 'Deploy to Cloudflare Workers'))
      .toBeLessThan(requiredStepIndex(deploy, 'Verify deployed Worker health'))
    expect(deploy).toContain('content-security-policy')
    expect(deploy).toContain('x-content-type-options:')
  })

  it('serializes production promotion and proves the deployed build provenance', () => {
    const deploy = workflow('deploy-worker.yml')
    const packageJson = readFileSync(resolve(root, 'package.json'), 'utf8')
    const headers = readFileSync(resolve(root, 'public/_headers'), 'utf8')

    expect(deploy).toContain('group: sqa-production-release')
    expect(deploy).toContain('cancel-in-progress: false')
    expect(deploy).not.toContain('group: deploy-worker-${{ github.ref }}')
    expect(requiredStepIndex(deploy, 'Build'))
      .toBeLessThan(requiredStepIndex(deploy, 'Deploy to Cloudflare Workers'))
    expect(requiredStepIndex(deploy, 'Deploy to Cloudflare Workers'))
      .toBeLessThan(requiredStepIndex(deploy, 'Verify deployed build provenance'))
    expect(requiredStepIndex(deploy, 'Verify deployed build provenance'))
      .toBeLessThan(requiredStepIndex(deploy, 'Verify deployed Worker health'))
    expect(deploy).toContain('BUILD_PROVENANCE_MODE: production')
    expect(deploy).toContain('BUILD_PROVENANCE_SHA: ${{ github.sha }}')
    expect(deploy).toContain('BUILD_PROVENANCE_REF: ${{ github.ref }}')
    expect(deploy).toContain('"$WORKER_URL/version.json"')
    expect(deploy).toContain('verify-build-provenance.mjs')
    expect(deploy).toContain("jq -r '.lockfileSha256'")
    expect(deploy).toContain("jq -r '.readinessManifestSha256'")
    expect(packageJson).toContain('render-build-provenance.mjs')
    expect(headers).toMatch(/\/version\.json\s+Cache-Control: no-store/)
  })

  it('keeps encrypted daily backups and failure notification', () => {
    const backup = workflow('backup.yml')
    const migrate = workflow('db-migrate.yml')
    expect(backup).toContain("cron: '0 20 * * *'")
    expect(backup).toContain('.tar.gz.gpg')
    expect(backup).toContain('.tar.gz.enc')
    expect(backup).toContain('node scripts/verify-dr-package.mjs')
    expect(backup).toContain('--backup-class L2')
    expect(backup).toContain('--auth-identity-included false')
    expect(backup).toContain('capture-dr-database-evidence.mjs')
    expect(backup).toContain('dump/source-evidence.json')
    expect(backup).toContain('--storage-object-count "$storage_object_count"')
    expect(backup).toContain('Assert plaintext removed')
    expect(backup).not.toMatch(/path:\s*\|[\s\S]*?\.sql/m)
    expect(backup).not.toMatch(/path:\s*\|[\s\S]*?dr-manifest\.json/m)
    expect(backup).toContain('group: sqa-production-release')
    expect(migrate).toContain('group: sqa-production-release')
    expect(workflow('deploy-worker.yml')).toContain('group: sqa-production-release')
    assertSecretScope(backup, backupSecrets)
    expect(backup).toContain('notify-failure:')
    expect(backup).toContain('gh issue create')
  })

  it('keeps the full DR rehearsal manual, disposable, target-only, and fail closed', () => {
    const rehearsal = workflow('dr-rehearsal.yml')
    expect(rehearsal).toContain('workflow_dispatch:')
    expect(rehearsal).not.toMatch(/^\s+(push|schedule):/m)
    expect(rehearsal).toContain('environment: dr-rehearsal')
    expect(rehearsal).toContain('confirm_disposable_target')
    expect(rehearsal).toContain('platform_clone')
    expect(rehearsal).toContain('DR_ALLOWED_TARGET_REFS')
    expect(rehearsal).toContain('SQA_DR_TARGET_IS_PRODUCTION')
    expect(rehearsal).toContain('SQA_DR_TARGET_NOT_ALLOWLISTED')
    expect(rehearsal).toContain('verify-dr-package.mjs')
    expect(rehearsal).toContain('verify-restored-project.mjs')
    expect(rehearsal).toContain('SQA_DR_ARCHIVE_PATH_INVALID')
    expect(rehearsal).toContain('--no-same-owner --no-same-permissions')
    expect(rehearsal).toContain('target_disposition')
    expect(rehearsal).toContain('operator must delete the disposable target')
    expect(rehearsal).not.toContain('secrets.SUPABASE_DB_URL')
    expect(rehearsal).not.toContain('environment: production')
    expect(rehearsal).not.toMatch(/wrangler\s+deploy|supabase\s+db\s+push/)
    expect(rehearsal).not.toMatch(/path:\s*\|[\s\S]*?source-evidence\.json/m)
    expect(rehearsal).not.toMatch(/path:\s*\|[\s\S]*?smoke-evidence\.json/m)
    expect(rehearsal).toContain('if: ${{ always() }}')
    expect(rehearsal).toContain('rm -rf dr-work')
    assertSecretScope(rehearsal, drRehearsalSecrets)
  })
})
