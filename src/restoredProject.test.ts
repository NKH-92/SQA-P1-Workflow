import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { verifyRestoredProject } from '../scripts/verify-restored-project.mjs'

const temporaryDirectories: string[] = []
const digest = 'a'.repeat(64)
const otherDigest = 'b'.repeat(64)

function databaseEvidence() {
  return {
    schemaVersion: 1,
    capturedAt: '2026-07-20T00:00:00.000Z',
    auth: { userCount: 5, uuidSetSha256: digest },
    tables: {
      'public.profiles': { rowCount: 5, canonicalSha256: digest },
      'public.products': { rowCount: 3, canonicalSha256: digest },
      'public.review_requests': { rowCount: 7, canonicalSha256: digest },
      'public.review_feedback': { rowCount: 2, canonicalSha256: digest },
      'public.review_events': { rowCount: 9, canonicalSha256: digest },
      'public.change_applications': { rowCount: 1, canonicalSha256: digest },
      'public.product_change_tasks': { rowCount: 2, canonicalSha256: digest },
      'private.audit_events': { rowCount: 11, canonicalSha256: digest },
    },
    migrationHistory: { versionCount: 56, versionSetSha256: digest },
    configuration: {
      extensionsSha256: digest,
      realtimePublicationsSha256: digest,
      storageObjectCount: 0,
    },
    foreignKeyOrphans: {
      profiles_id_fkey: 0,
      review_requests_requester_id_fkey: 0,
      review_feedback_review_request_id_fkey: 0,
    },
  }
}

function smokeEvidence() {
  return {
    schemaVersion: 1,
    strategy: 'platform_clone',
    targetProjectRef: 'abcdefghijklmnopqrst',
    productionProjectRef: 'zyxwvutsrqponmlkjihg',
    allowedTargetRefs: ['abcdefghijklmnopqrst'],
    preservedLogin: true,
    preservedUserIdMatches: true,
    authSettings: {
      signupDisabled: true,
      emailProviderEnabled: true,
      emailConfirmationRequired: true,
      anonymousUsersDisabled: true,
    },
    rls: { passed: true, testFiles: 8, skippedTests: 0 },
    audit: true,
    reviewLifecycle: true,
    changeTaskAuthorization: true,
    secretsExposed: false,
    targetDisposition: 'delete_after_evidence',
  }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('restored project evidence', () => {
  it('accepts exact source/target database evidence and complete remote smoke evidence', () => {
    const result = verifyRestoredProject({
      sourceEvidence: databaseEvidence(),
      targetEvidence: databaseEvidence(),
      smokeEvidence: smokeEvidence(),
    })

    expect(result).toMatchObject({
      schemaVersion: 1,
      strategy: 'platform_clone',
      targetProjectRef: 'abcdefghijklmnopqrst',
      passed: true,
    })
    expect(JSON.stringify(result)).not.toContain('productionProjectRef')
  })

  it('rejects the production project or a target outside the allowlist', () => {
    const productionTarget = smokeEvidence()
    productionTarget.productionProjectRef = productionTarget.targetProjectRef
    expect(() => verifyRestoredProject({
      sourceEvidence: databaseEvidence(),
      targetEvidence: databaseEvidence(),
      smokeEvidence: productionTarget,
    })).toThrow(/SQA_DR_TARGET_IS_PRODUCTION/)

    const outsideAllowlist = smokeEvidence()
    outsideAllowlist.allowedTargetRefs = ['11111111111111111111']
    expect(() => verifyRestoredProject({
      sourceEvidence: databaseEvidence(),
      targetEvidence: databaseEvidence(),
      smokeEvidence: outsideAllowlist,
    })).toThrow(/SQA_DR_TARGET_NOT_ALLOWLISTED/)
  })

  it('rejects Auth UUID, table checksum, and migration history drift', () => {
    for (const mutate of [
      (target: ReturnType<typeof databaseEvidence>) => { target.auth.uuidSetSha256 = otherDigest },
      (target: ReturnType<typeof databaseEvidence>) => {
        target.tables['public.review_requests'].canonicalSha256 = otherDigest
      },
      (target: ReturnType<typeof databaseEvidence>) => { target.migrationHistory.versionCount -= 1 },
    ]) {
      const target = databaseEvidence()
      mutate(target)
      expect(() => verifyRestoredProject({
        sourceEvidence: databaseEvidence(),
        targetEvidence: target,
        smokeEvidence: smokeEvidence(),
      })).toThrow(/SQA_DR_(AUTH|TABLE|MIGRATION)_EVIDENCE_MISMATCH/)
    }
  })

  it('rejects any restored FK orphan', () => {
    const target = databaseEvidence()
    target.foreignKeyOrphans.review_requests_requester_id_fkey = 1

    expect(() => verifyRestoredProject({
      sourceEvidence: databaseEvidence(),
      targetEvidence: target,
      smokeEvidence: smokeEvidence(),
    })).toThrow(/SQA_DR_TARGET_FK_ORPHAN/)
  })

  it('rejects incomplete login, Auth settings, RLS, or business smoke evidence', () => {
    const cases = [
      (smoke: ReturnType<typeof smokeEvidence>) => { smoke.preservedLogin = false },
      (smoke: ReturnType<typeof smokeEvidence>) => { smoke.authSettings.signupDisabled = false },
      (smoke: ReturnType<typeof smokeEvidence>) => { smoke.rls.skippedTests = 1 },
      (smoke: ReturnType<typeof smokeEvidence>) => { smoke.audit = false },
      (smoke: ReturnType<typeof smokeEvidence>) => { smoke.reviewLifecycle = false },
      (smoke: ReturnType<typeof smokeEvidence>) => { smoke.changeTaskAuthorization = false },
      (smoke: ReturnType<typeof smokeEvidence>) => { smoke.secretsExposed = true },
    ]
    for (const mutate of cases) {
      const smoke = smokeEvidence()
      mutate(smoke)
      expect(() => verifyRestoredProject({
        sourceEvidence: databaseEvidence(),
        targetEvidence: databaseEvidence(),
        smokeEvidence: smoke,
      })).toThrow(/SQA_DR_SMOKE_EVIDENCE_FAILED/)
    }
  })

  it('writes a redacted evidence artifact', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sqa-restored-project-'))
    temporaryDirectories.push(directory)
    const result = verifyRestoredProject({
      sourceEvidence: databaseEvidence(),
      targetEvidence: databaseEvidence(),
      smokeEvidence: smokeEvidence(),
    })
    const output = join(directory, 'result.json')
    writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`)

    const serialized = readFileSync(output, 'utf8')
    expect(serialized).toContain('"passed": true')
    expect(serialized).not.toMatch(/password|token|secret|productionProjectRef/i)
  })

  it('passes the workflow CLI dry-run fixture and writes only redacted final evidence', () => {
    const directory = mkdtempSync(join(tmpdir(), 'sqa-restored-project-cli-'))
    temporaryDirectories.push(directory)
    const source = join(directory, 'source.json')
    const target = join(directory, 'target.json')
    const smoke = join(directory, 'smoke.json')
    const output = join(directory, 'result.json')
    writeFileSync(source, JSON.stringify(databaseEvidence()))
    writeFileSync(target, JSON.stringify(databaseEvidence()))
    writeFileSync(smoke, JSON.stringify(smokeEvidence()))

    const result = spawnSync(process.execPath, [
      join(import.meta.dirname, '..', 'scripts', 'verify-restored-project.mjs'),
      '--source', source,
      '--target', target,
      '--smoke', smoke,
      '--output', output,
    ], { encoding: 'utf8' })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('SQA_DR_RESTORED_PROJECT_OK')
    expect(readFileSync(output, 'utf8')).not.toMatch(/password|token|secret|productionProjectRef/i)
  })
})
