import { readdirSync, readFileSync } from 'node:fs'
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
  { job: 'migrate', step: 'Check secret', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Guard migration history', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'List migration status (before)', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Guard Stage B Storage handoff', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Push pending migrations', secret: 'SUPABASE_DB_URL' },
  { job: 'migrate', step: 'Verify production DB readiness from canonical SQL', secret: 'SUPABASE_DB_URL' },
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
    expect(ci).toContain('needs: [typecheck, lint, test, rls]')
    expect(deploy).toContain('rls:\n    needs: guard\n    uses: ./.github/workflows/reusable-rls.yml')
    expect(deploy).toContain('deploy:\n    needs: rls')
    expect(reusable).toContain('npm run test:rls:full')
    expect(reusable).toContain('if: ${{ always() }}')
    expect(reusable).not.toContain('secrets.')
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
    expect(requiredStepIndex(deploy, 'Verify production DB readiness from canonical SQL'))
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
    expect(manifest.migrationVersions).toHaveLength(56)
    for (const invariant of [
      "to_regprocedure('public.add_product_assignment(uuid,uuid)')",
      "to_regprocedure('public.resubmit_review_request(uuid,timestamp with time zone,text)')",
      "policyname = 'announcements_select_app_user'",
      "policyname = 'product_change_tasks_select_relevant'",
      "to_regprocedure('private.record_mutation_audit()')",
      'count(*) = 16',
      'search_path=pg_catalog, public, private, pg_temp',
      "tgenabled in ('O', 'A')",
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

  it('keeps encrypted daily backups and failure notification', () => {
    const backup = workflow('backup.yml')
    expect(backup).toContain("cron: '0 20 * * *'")
    expect(backup).toContain('.tar.gz.gpg')
    expect(backup).toContain('.tar.gz.enc')
    expect(backup).toContain('--decrypt -- "$gpg_temp" | tar tzf -')
    expect(backup).toContain('notify-failure:')
    expect(backup).toContain('gh issue create')
  })
})
