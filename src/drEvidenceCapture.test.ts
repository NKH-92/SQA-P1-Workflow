import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { assertDatabaseUrlProjectRef, assertDockerContainerName, buildDatabaseEvidence } from '../scripts/capture-dr-database-evidence.mjs'

const sha256 = (rows: string[]) => createHash('sha256').update(rows.join('\n')).digest('hex')

describe('DR database evidence capture', () => {
  it('reduces raw ordered rows to counts and SHA-256 digests without retaining row data', () => {
    const evidence = buildDatabaseEvidence({
      capturedAt: '2026-07-20T00:00:00.000Z',
      authRows: ['user-a', 'user-b'],
      tableRows: {
        'public.profiles': ['{"id":"user-a"}', '{"id":"user-b"}'],
        'private.audit_events': [],
      },
      migrationRows: ['202607020001', '20260718161549'],
      extensionRows: ['pgcrypto=1.3'],
      realtimeRows: ['public.review_requests'],
      storageObjectCount: 0,
      foreignKeyOrphans: { profiles_id_fkey: 0 },
    })

    expect(evidence.auth).toEqual({ userCount: 2, uuidSetSha256: sha256(['user-a', 'user-b']) })
    expect(evidence.tables['public.profiles']).toEqual({
      rowCount: 2,
      canonicalSha256: sha256(['{"id":"user-a"}', '{"id":"user-b"}']),
    })
    expect(evidence.migrationHistory).toEqual({
      versionCount: 2,
      versionSetSha256: sha256(['202607020001', '20260718161549']),
    })
    expect(JSON.stringify(evidence)).not.toContain('user-a')
  })

  it('rejects unordered, duplicate, malformed, or non-zero source orphan evidence', () => {
    const base = {
      capturedAt: '2026-07-20T00:00:00.000Z',
      authRows: ['user-a'],
      tableRows: { 'public.profiles': ['{}'] },
      migrationRows: ['202607020001'],
      extensionRows: ['pgcrypto=1.3'],
      realtimeRows: ['public.review_requests'],
      storageObjectCount: 0,
      foreignKeyOrphans: { profiles_id_fkey: 0 },
    }
    for (const mutate of [
      (input: typeof base) => { input.authRows = ['user-b', 'user-a'] },
      (input: typeof base) => { input.migrationRows = ['202607020001', '202607020001'] },
      (input: typeof base) => { input.storageObjectCount = -1 },
      (input: typeof base) => { input.foreignKeyOrphans.profiles_id_fkey = 1 },
    ]) {
      const input = structuredClone(base)
      mutate(input)
      expect(() => buildDatabaseEvidence(input)).toThrow(/SQA_DR_CAPTURE_/)
    }
  })

  it('binds direct and pooler database URLs to the expected target project ref', () => {
    const ref = 'abcdefghijklmnopqrst'
    expect(() => assertDatabaseUrlProjectRef(
      `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres`,
      ref,
    )).not.toThrow()
    expect(() => assertDatabaseUrlProjectRef(
      `postgresql://postgres.${ref}:password@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres`,
      ref,
    )).not.toThrow()
    expect(() => assertDatabaseUrlProjectRef(
      'postgresql://postgres.otherprojectref00000:password@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres',
      ref,
    )).toThrow(/SQA_DR_CAPTURE_DATABASE_TARGET_MISMATCH/)
  })

  it('accepts only a literal Docker container name for local psql execution', () => {
    expect(() => assertDockerContainerName('supabase_db_SQA-P1-Workflow')).not.toThrow()
    expect(() => assertDockerContainerName(undefined)).not.toThrow()
    for (const value of ['supabase db', '../supabase_db', 'supabase_db;whoami']) {
      expect(() => assertDockerContainerName(value)).toThrow(
        /SQA_DR_CAPTURE_DOCKER_CONTAINER_INVALID/,
      )
    }
  })
})
