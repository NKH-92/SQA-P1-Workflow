import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(
  resolve('supabase/migrations/20260718073243_finalize_review_workflow_hardening.sql'),
  'utf8',
)
const purgeScript = readFileSync(resolve('scripts/purge-review-attachments.mjs'), 'utf8')
const config = readFileSync(resolve('supabase/config.toml'), 'utf8')
const ciWorkflow = readFileSync(resolve('.github/workflows/ci.yml'), 'utf8')
const deployWorkflow = readFileSync(resolve('.github/workflows/deploy-worker.yml'), 'utf8')
const executableMigration = migration
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/--.*$/gm, '')
const storageRowDml = /\b(?:delete\s+from|insert\s+into|update|merge\s+into|truncate(?:\s+table)?)\s+(?:only\s+)?(?:"storage"|storage)\s*\.\s*(?:"(?:objects|buckets)"|(?:objects|buckets))(?![\w$])/i

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
    for (const workflow of [ciWorkflow, deployWorkflow]) {
      expect(workflow).toContain('supabase db reset --version 20260718054127')
      expect(workflow).toContain('node scripts/purge-review-attachments.mjs --execute --confirm=PURGE_REVIEW_ATTACHMENTS')
      expect(workflow).toContain('supabase migration up --local')
      expect(workflow.indexOf('supabase migration up --local'))
        .toBeGreaterThan(workflow.indexOf('node scripts/purge-review-attachments.mjs --execute'))
    }
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
})
