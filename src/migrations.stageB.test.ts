import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readText = (path: string) => readFileSync(resolve(path), 'utf8').replace(/\r\n?/g, '\n')

const migration = readText(
  'supabase/migrations/20260718073243_finalize_review_workflow_hardening.sql',
)
const followUpMigration = readText(
  'supabase/migrations/20260718123250_remove_obsolete_review_status_rpc.sql',
)
const purgeScript = readText('scripts/purge-review-attachments.mjs')
const verificationSql = readText('scripts/verify-review-hardening-followup.sql')
const localMigrationScript = readText('scripts/apply-pending-migrations.ps1')
const localRlsGateScript = readText('scripts/run-local-rls-gate.mjs')
const reviewReadinessSql = readText('scripts/sql/verify/20_review_workflow.sql')
const reusableRlsWorkflow = readText('.github/workflows/reusable-rls.yml')
const config = readText('supabase/config.toml')
const ciWorkflow = readText('.github/workflows/ci.yml')
const deployWorkflow = readText('.github/workflows/deploy-worker.yml')
const dbMigrateWorkflow = readText('.github/workflows/db-migrate.yml')
const executableMigration = migration
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '')
const executableFollowUpMigration = followUpMigration
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '')
const storageRowDml = /\b(?:delete\s+from|insert\s+into|update|merge\s+into|truncate(?:\s+table)?)\s+(?:only\s+)?(?:"storage"|storage)\s*\.\s*(?:"(?:objects|buckets)"|(?:objects|buckets))(?![\w$])/i
const immutableStageBSha256 = '8e8d36f4cdab97b26dd047de89dd13ea2f50720a59580174a69a62a78ec49511'

function passesNoAnonApplicationRoutineGate(
  routines: Array<{ anonExecute: boolean; extensionMember: boolean }>,
) {
  return !routines.some((routine) => routine.anonExecute && !routine.extensionMember)
}

describe('review workflow hardening Stage B migration', () => {
  it('requires zero objects and an API-deleted bucket before destructive cleanup', () => {
    const objectGuard = migration.indexOf("where bucket_id = 'review-attachments'")
    const objectFailure = migration.indexOf('SQA_REVIEW_ATTACHMENTS_NOT_EMPTY')
    const bucketGuard = migration.indexOf('from storage.buckets')
    const bucketFailure = migration.indexOf('SQA_REVIEW_ATTACHMENTS_BUCKET_PRESENT')
    const policyDrop = migration.indexOf('drop policy if exists "review_attachments_insert_self"')
    const raceFailure = migration.indexOf('SQA_REVIEW_ATTACHMENTS_RACE_DETECTED')
    const recreatedFailure = migration.indexOf('SQA_REVIEW_ATTACHMENTS_BUCKET_RECREATED')
    const columnDrop = migration.indexOf('drop column attachment_url')

    expect(objectGuard).toBeGreaterThan(-1)
    expect(objectFailure).toBeGreaterThan(objectGuard)
    expect(bucketGuard).toBeGreaterThan(objectFailure)
    expect(bucketFailure).toBeGreaterThan(bucketGuard)
    expect(policyDrop).toBeGreaterThan(bucketFailure)
    expect(raceFailure).toBeGreaterThan(policyDrop)
    expect(recreatedFailure).toBeGreaterThan(raceFailure)
    expect(columnDrop).toBeGreaterThan(recreatedFailure)
    expect(executableMigration).not.toMatch(storageRowDml)
  })

  it('splits disposable migration replay around the same Storage API handoff', () => {
    expect(localRlsGateScript).toContain('20260718073243_finalize_review_workflow_hardening.sql')
    expect(localRlsGateScript).toContain("readdirSync(resolve(root, 'supabase/migrations'))")
    expect(localRlsGateScript).toContain(
      ".filter((name) => /^\\d{12,14}_.+\\.sql$/.test(name) && name >= firstHeld)",
    )
    expect(localRlsGateScript).toContain('.sort()')
    expect(localRlsGateScript).toContain('renameSync(source, destination)')
    expect(localRlsGateScript).toContain('restoreMigrations(heldMigrations)')
    expect(localRlsGateScript).toContain("'--confirm=PURGE_REVIEW_ATTACHMENTS'")
    expect(localRlsGateScript).toContain("runSupabase(['migration', 'up', '--local', '--include-all'])")
    expect(localRlsGateScript).toContain("runSupabase(['db', 'lint', '--local', '--level', 'error', '--fail-on', 'error'])")
    expect(localRlsGateScript).toContain('toRootRelativePath(evidenceSql)')
    expect(localRlsGateScript).toContain('runCanonicalSql(verificationSql, temporaryDirectory)')
    expect(localRlsGateScript).toContain('SQA_RLS_GATE_UNSUPPORTED_CANONICAL_SQL')
    expect(localRlsGateScript.indexOf("'--confirm=PURGE_REVIEW_ATTACHMENTS'"))
      .toBeGreaterThan(localRlsGateScript.indexOf("runSupabase(['start'])"))
    expect(localRlsGateScript.indexOf("runSupabase(['migration', 'up', '--local', '--include-all'])"))
      .toBeGreaterThan(localRlsGateScript.indexOf("'--confirm=PURGE_REVIEW_ATTACHMENTS'"))
    for (const workflow of [ciWorkflow, deployWorkflow]) {
      expect(workflow).toContain('uses: ./.github/workflows/reusable-rls.yml')
    }
    expect(reusableRlsWorkflow).toContain('run: npm run test:rls:full')
    expect(reusableRlsWorkflow).toContain('if: ${{ always() }}')
    expect(purgeScript).toContain('storageClient.deleteBucket(bucket)')
    expect(purgeScript).toContain('storageClient.getBucket(bucket)')
  })

  it('removes every attachment compatibility object and the legacy password RPC', () => {
    expect(migration).toContain('drop policy if exists "review_attachments_select_self_or_leader"')
    expect(migration).toContain('drop policy if exists "review_attachments_insert_self"')
    expect(migration).toContain('drop policy if exists "review_attachments_delete_self_or_leader"')
    expect(migration).toContain('drop trigger if exists review_requests_validate_attachment')
    expect(migration).toContain("proc.proname = 'validate_review_attachment_url'")
    expect(migration).toContain('drop column attachment_url')
    expect(migration).toContain("proc.proname = 'mark_password_changed'")
  })

  it('makes review writes RPC-only and leaves legacy overloads ungranted', () => {
    expect(migration).toContain('drop policy if exists "review_requests_insert_self_pending"')
    expect(migration).toContain('drop policy if exists "review_requests_update_self_pending_or_rejected"')
    expect(migration).toContain('drop policy if exists "review_requests_delete_leader"')
    expect(migration).toContain('drop policy if exists "review_feedback_delete_leader"')
    expect(migration).toContain('grant execute on function public.update_review_request(uuid, timestamptz, text, text, date)')
    expect(migration).toContain('grant execute on function public.approve_review_request(uuid, timestamptz)')
    expect(migration).toContain('proc.oid::pg_catalog.regprocedure <> all')
    expect(migration).not.toContain('grant execute on function public.update_review_request_status')
    expect(migration).not.toContain('grant execute on function public.reject_review_request(uuid, text)')
    expect(migration).not.toContain('grant execute on function public.reopen_review_request(uuid)')
  })

  it('installs an explicit current and future-object ACL manifest', () => {
    expect(config).toContain('auto_expose_new_tables = false')
    expect(migration).toContain('revoke all privileges on all tables in schema public')
    expect(migration).toContain('revoke execute on all routines in schema public')
    expect(migration).toContain('revoke all on schema public from public, anon, authenticated, service_role')
    expect(migration).toContain('revoke all on schema private from public, anon, authenticated, service_role')
    expect(migration).toContain('grant select on table')
    expect(migration).toContain('public.review_events')
    expect(migration).toContain('public.review_read_receipts')
    expect(migration).toContain('grant all privileges on all tables in schema public to service_role')
    expect(migration).toContain('alter default privileges for role postgres\n  revoke execute on routines from public, anon, authenticated, service_role')
    expect(migration).toContain('alter default privileges for role postgres in schema public')
    expect(migration).toContain('revoke execute on routines from public, anon, authenticated, service_role')
  })

  it('keeps the applied Stage B migration immutable', () => {
    expect(createHash('sha256').update(migration).digest('hex')).toBe(immutableStageBSha256)
    expect(migration).not.toContain('drop function if exists public.update_review_request_status')
  })

  it('drops only the exact obsolete RPC in an append-only follow-up', () => {
    expect(followUpMigration).toContain(
      'drop function if exists public.update_review_request_status(uuid, public.review_status) restrict',
    )
    expect(executableFollowUpMigration).not.toMatch(/\bcascade\b/i)
    expect(executableFollowUpMigration).not.toMatch(/alter\s+extension\s+citext/i)
    expect(executableFollowUpMigration).not.toMatch(/\b(?:grant|revoke)\b/i)
    expect(executableFollowUpMigration).not.toMatch(/\b(?:alter|create|drop)\s+(?:table|policy)\b/i)
    expect(executableFollowUpMigration).not.toMatch(storageRowDml)
    expect(followUpMigration).toContain("notify pgrst, 'reload schema'")
  })

  it('requires the follow-up and excludes only catalog extension members from the anon gate', () => {
    for (const source of [verificationSql, reviewReadinessSql]) {
      expect(source).toContain("version = '20260718123250'")
      expect(source).toContain("pg_catalog.has_function_privilege('anon', function.oid, 'EXECUTE')")
      expect(source).toContain('from pg_catalog.pg_depend dependency')
      expect(source).toContain('join pg_catalog.pg_extension extension')
      expect(source).toContain(
        "dependency.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass",
      )
      expect(source).toContain(
        "dependency.refclassid = 'pg_catalog.pg_extension'::pg_catalog.regclass",
      )
      expect(source).toContain("dependency.deptype = 'e'")
      expect(source).not.toContain("extension.extname = 'citext'")
    }
    for (const consumer of [dbMigrateWorkflow, deployWorkflow, localMigrationScript]) {
      expect(consumer).toContain('manifest.json')
    }
    expect(dbMigrateWorkflow).not.toMatch(/alter\s+extension\s+citext\s+set\s+schema/i)
  })

  it('allows extension routines but still fails on an anon-callable application routine', () => {
    const extensionRoutines = Array.from({ length: 47 }, () => ({
      anonExecute: true,
      extensionMember: true,
    }))

    expect(passesNoAnonApplicationRoutineGate(extensionRoutines)).toBe(true)
    expect(passesNoAnonApplicationRoutineGate([
      ...extensionRoutines,
      { anonExecute: true, extensionMember: false },
    ])).toBe(false)
    expect(passesNoAnonApplicationRoutineGate([
      ...extensionRoutines,
      { anonExecute: false, extensionMember: false },
    ])).toBe(true)
  })
})
