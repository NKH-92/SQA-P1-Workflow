import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { recoverLeftoverHeldMigrations } from '../scripts/run-local-rls-gate.mjs'

const recover = recoverLeftoverHeldMigrations as (root: string, log?: (message: string) => void) => string[]

describe('local RLS gate leftover migration recovery', () => {
  let root: string
  let migrations: string

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'sqa-rls-gate-recovery-'))
    migrations = join(root, 'supabase', 'migrations')
    mkdirSync(migrations, { recursive: true })
    writeFileSync(join(migrations, '20260101000000_base.sql'), 'select 1;\n')
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  function leftover(name: string, files: Record<string, string>) {
    const directory = join(root, name)
    mkdirSync(directory)
    for (const [file, content] of Object.entries(files)) writeFileSync(join(directory, file), content)
    return directory
  }

  it('does nothing when no interrupted run left a held folder', () => {
    const log = vi.fn()
    mkdirSync(join(root, 'unrelated'))

    expect(recover(root, log)).toEqual([])
    expect(log).not.toHaveBeenCalled()
    expect(readdirSync(migrations)).toEqual(['20260101000000_base.sql'])
    expect(existsSync(join(root, 'unrelated'))).toBe(true)
  })

  it('moves held migrations back, logs them, and removes the leftover folder', () => {
    const log = vi.fn()
    const directory = leftover('.sqa-local-rls-abc123', {
      '20260718073243_finalize_review_workflow_hardening.sql': 'held one\n',
      '20260927120000_draft_uncommitted.sql': 'draft\n',
      'rls-fixtures.json': '{"RLS_SECRET":"x"}',
      'legacy-review-input.sql': 'do $verify$ begin end $verify$;\n',
      '12345_short_version.sql': 'not a migration name\n',
    })

    expect(recover(root, log)).toEqual([
      '20260718073243_finalize_review_workflow_hardening.sql',
      '20260927120000_draft_uncommitted.sql',
    ])
    expect(readdirSync(migrations).sort()).toEqual([
      '20260101000000_base.sql',
      '20260718073243_finalize_review_workflow_hardening.sql',
      '20260927120000_draft_uncommitted.sql',
    ])
    expect(readFileSync(join(migrations, '20260927120000_draft_uncommitted.sql'), 'utf8')).toBe('draft\n')
    expect(existsSync(directory)).toBe(false)
    expect(log).toHaveBeenCalledTimes(1)
    expect(log.mock.calls[0][0]).toContain('SQA_RLS_GATE_LEFTOVER_RESTORED: .sqa-local-rls-abc123 (2 migrations)')
    expect(log.mock.calls[0][0]).toContain('20260927120000_draft_uncommitted.sql')
  })

  it('removes an empty leftover folder and recovers several folders', () => {
    const log = vi.fn()
    leftover('.sqa-local-rls-empty1', { 'private-evidence.sql': 'x' })
    leftover('.sqa-local-rls-held02', { '20260801000000_second.sql': 'second\n' })

    expect(recover(root, log)).toEqual(['20260801000000_second.sql'])
    expect(readdirSync(root).filter((name) => name.startsWith('.sqa-local-rls-'))).toEqual([])
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('stops without overwriting when a same-named migration already exists', () => {
    const directory = leftover('.sqa-local-rls-conflict', {
      '20260101000000_base.sql': 'stale held copy\n',
      '20260801000000_other.sql': 'other\n',
    })

    expect(() => recover(root, vi.fn())).toThrow(
      'SQA_RLS_GATE_LEFTOVER_MIGRATION_CONFLICT: .sqa-local-rls-conflict/20260101000000_base.sql',
    )
    expect(readFileSync(join(migrations, '20260101000000_base.sql'), 'utf8')).toBe('select 1;\n')
    // A conflict leaves the whole folder untouched for manual review.
    expect(readdirSync(directory).sort()).toEqual(['20260101000000_base.sql', '20260801000000_other.sql'])
    expect(existsSync(join(migrations, '20260801000000_other.sql'))).toBe(false)
  })
})
