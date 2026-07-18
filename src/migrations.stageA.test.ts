import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = (name: string) => readFileSync(resolve('supabase/migrations', name), 'utf8')

describe('review workflow hardening Stage A migrations', () => {
  it('adds compact review events and server read receipts with explicit grants', () => {
    const sql = migration('20260718054124_harden_review_workflow.sql')
    expect(sql).toContain('create table if not exists public.review_events')
    expect(sql).toContain('create table if not exists public.review_read_receipts')
    expect(sql).toContain("'feedback_voided'")
    expect(sql).toContain('grant select on table public.review_events to authenticated')
    expect(sql).toContain('revoke all on sequence public.review_events_id_seq from public, anon, authenticated')
  })

  it('observes Auth password changes and makes the compatibility RPC fail closed', () => {
    const sql = migration('20260718054124_harden_review_workflow.sql')
    expect(sql).toContain('after update of encrypted_password on auth.users')
    expect(sql).toContain('password change has not been observed by Auth')
    expect(sql).toContain('SQA_PASSWORD_CHANGE_NOT_OBSERVED')
  })

  it('soft-withdraws reviews and voids feedback through OCC RPCs', () => {
    const sql = migration('20260718054124_harden_review_workflow.sql')
    expect(sql).toContain('create or replace function public.withdraw_review_request(')
    expect(sql).toContain('p_expected_updated_at timestamptz')
    expect(sql).toContain("set status = 'withdrawn'")
    expect(sql).toContain('create or replace function public.void_review_feedback(')
    expect(sql).not.toContain('drop column attachment_url')
  })

  it('keeps scope removals editable while requiring an explicit reason to restore them', () => {
    const sql = migration('20260718054127_harden_change_audit_and_acl.sql')
    expect(sql).toContain("existing_task.cancel_kind is distinct from 'scope_removed'")
    expect(sql).toContain('scope removed product task must be restored with a reason first')
    expect(sql).toContain('SQA_SCOPE_RESTORE_REASON_REQUIRED')
    expect(sql).toContain('before_delta jsonb')
    expect(sql).toContain('changed_fields text[]')
  })
})
