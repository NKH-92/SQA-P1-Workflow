import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { validateReadinessManifest } from '../scripts/validate-readiness-manifest.mjs'

const temporaryDirectories: string[] = []
const readinessFiles = [
  '00_migration_history.sql',
  '10_assignment_security.sql',
  '20_review_workflow.sql',
  '30_announcement_contract.sql',
  '40_change_application_contract.sql',
  '50_audit_v3.sql',
]
const migrationVersions = ['202607020001', '20260718161549']

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sqa-readiness-manifest-'))
  temporaryDirectories.push(root)
  const verifyDirectory = join(root, 'scripts', 'sql', 'verify')
  const migrationDirectory = join(root, 'supabase', 'migrations')
  mkdirSync(verifyDirectory, { recursive: true })
  mkdirSync(migrationDirectory, { recursive: true })
  for (const file of readinessFiles) {
    const content = file === '00_migration_history.sql'
      ? migrationVersions.map((version) => `'${version}'`).join(',\n')
      : '-- fixture'
    writeFileSync(join(verifyDirectory, file), content)
  }
  for (const version of migrationVersions) writeFileSync(join(migrationDirectory, `${version}_fixture.sql`), '-- fixture')

  const writeManifest = (overrides: Record<string, unknown> = {}) => {
    writeFileSync(join(verifyDirectory, 'manifest.json'), JSON.stringify({
      schemaVersion: 1,
      readinessFiles,
      migrationVersions,
      ...overrides,
    }))
  }
  writeManifest()
  return { root, verifyDirectory, writeManifest }
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('readiness manifest', () => {
  it('accepts exact ordered readiness and migration sets', () => {
    const { root } = fixture()
    expect(validateReadinessManifest(root)).toEqual({ readinessFiles, migrationVersions })
  })

  it('fails when a new numbered SQL file is missing from the manifest', () => {
    const { root, verifyDirectory } = fixture()
    writeFileSync(join(verifyDirectory, '60_new_contract.sql'), '-- unregistered')
    expect(() => validateReadinessManifest(root)).toThrow('SQA_DB_READY_MANIFEST_MISMATCH')
  })

  it('fails when canonical migration-history SQL drifts from the manifest', () => {
    const { root, verifyDirectory } = fixture()
    writeFileSync(join(verifyDirectory, '00_migration_history.sql'), `'${migrationVersions[0]}'`)
    expect(() => validateReadinessManifest(root)).toThrow('SQA_DB_READY_MANIFEST_MISMATCH')
  })

  it('fails duplicate, traversal, and migration omission entries', () => {
    const duplicate = fixture()
    duplicate.writeManifest({ readinessFiles: [...readinessFiles, readinessFiles[0]] })
    expect(() => validateReadinessManifest(duplicate.root)).toThrow('SQA_DB_READY_MANIFEST_DUPLICATE')

    const traversal = fixture()
    traversal.writeManifest({ readinessFiles: ['../outside.sql'] })
    expect(() => validateReadinessManifest(traversal.root)).toThrow('SQA_DB_READY_MANIFEST_PATH')

    const omitted = fixture()
    omitted.writeManifest({ migrationVersions: migrationVersions.slice(0, 1) })
    expect(() => validateReadinessManifest(omitted.root)).toThrow('SQA_DB_READY_MANIFEST_MISMATCH')
  })
})
