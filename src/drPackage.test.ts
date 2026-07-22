import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { createDrManifest, verifyDrPackage } from '../scripts/verify-dr-package.mjs'

const temporaryDirectories: string[] = []
const sourceSha = '0123456789abcdef0123456789abcdef01234567'

function fixtureDirectory() {
  const root = mkdtempSync(join(tmpdir(), 'sqa-dr-package-'))
  temporaryDirectories.push(root)
  const packageDirectory = join(root, 'package')
  mkdirSync(packageDirectory)

  writeFileSync(join(packageDirectory, 'roles.sql'), 'CREATE ROLE "app_reader";\n')
  writeFileSync(join(packageDirectory, 'schema.sql'), [
    'CREATE SCHEMA "private";',
    'CREATE TABLE "public"."profiles" ("id" uuid PRIMARY KEY);',
    'CREATE TABLE "private"."audit_events" ("id" bigint PRIMARY KEY);',
  ].join('\n'))
  writeFileSync(join(packageDirectory, 'data.sql'), [
    'COPY "public"."profiles" ("id") FROM stdin;',
    '01234567-89ab-cdef-0123-456789abcdef',
    '\\.',
  ].join('\n'))
  writeFileSync(join(packageDirectory, 'migration-history.sql'), [
    'COPY "supabase_migrations"."schema_migrations" ("version") FROM stdin;',
    '20260718161549',
    '\\.',
  ].join('\n'))
  writeFileSync(join(packageDirectory, 'source-evidence.json'), JSON.stringify({
    schemaVersion: 1,
    auth: {},
    tables: {},
    migrationHistory: {},
    configuration: {},
    foreignKeyOrphans: {},
  }))

  createDrManifest({
    packageDirectory,
    sourceSha,
    createdAt: '2026-07-20T00:00:00.000Z',
    backupClass: 'L2',
    authIdentityIncluded: false,
    storageObjectCount: 0,
  })
  return packageDirectory
}

function readManifest(packageDirectory: string) {
  return JSON.parse(readFileSync(join(packageDirectory, 'dr-manifest.json'), 'utf8'))
}

function writeManifest(packageDirectory: string, manifest: unknown) {
  writeFileSync(join(packageDirectory, 'dr-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
}

function digest(contents: string) {
  return createHash('sha256').update(contents).digest('hex')
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('DR package contract', () => {
  it('accepts a complete L2 application database package', () => {
    const packageDirectory = fixtureDirectory()

    expect(verifyDrPackage(packageDirectory)).toMatchObject({
      backupClass: 'L2',
      authIdentityIncluded: false,
      storageObjectCount: 0,
    })
  })

  it('exposes the same fail-closed contract through the workflow CLI', () => {
    const packageDirectory = fixtureDirectory()
    const result = spawnSync(
      process.execPath,
      [join(import.meta.dirname, '..', 'scripts', 'verify-dr-package.mjs'), packageDirectory],
      { encoding: 'utf8' },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('SQA_DR_PACKAGE_OK class=L2')
    expect(result.stderr).toBe('')
  })

  it('rejects L3 when Auth identities are not included', () => {
    const packageDirectory = fixtureDirectory()
    const manifest = readManifest(packageDirectory)
    manifest.backupClass = 'L3'
    writeManifest(packageDirectory, manifest)

    expect(() => verifyDrPackage(packageDirectory)).toThrow(/SQA_DR_CLASS_AUTH_IDENTITY_REQUIRED/)
  })

  it('rejects a checksum mismatch', () => {
    const packageDirectory = fixtureDirectory()
    const dataPath = join(packageDirectory, 'data.sql')
    const data = readFileSync(dataPath, 'utf8')
    writeFileSync(dataPath, data.replace('01234567', '11234567'))

    expect(() => verifyDrPackage(packageDirectory)).toThrow(/SQA_DR_FILE_SHA256_MISMATCH/)
  })

  it('rejects a package missing the private audit schema', () => {
    const packageDirectory = fixtureDirectory()
    const schema = 'CREATE TABLE "public"."profiles" ("id" uuid PRIMARY KEY);\n'
    writeFileSync(join(packageDirectory, 'schema.sql'), schema)
    const manifest = readManifest(packageDirectory)
    const entry = manifest.files.find((file: { path: string }) => file.path === 'schema.sql')
    entry.bytes = Buffer.byteLength(schema)
    entry.sha256 = digest(schema)
    manifest.requiredObjects['private.audit_events'] = false
    writeManifest(packageDirectory, manifest)

    expect(() => verifyDrPackage(packageDirectory)).toThrow(/SQA_DR_REQUIRED_OBJECT_MISSING.*private\.audit_events/)
  })

  it('rejects missing migration history', () => {
    const packageDirectory = fixtureDirectory()
    const history = '-- no migration history\n'
    writeFileSync(join(packageDirectory, 'migration-history.sql'), history)
    const manifest = readManifest(packageDirectory)
    const entry = manifest.files.find((file: { path: string }) => file.path === 'migration-history.sql')
    entry.bytes = Buffer.byteLength(history)
    entry.sha256 = digest(history)
    manifest.requiredObjects['supabase_migrations.schema_migrations'] = false
    writeManifest(packageDirectory, manifest)

    expect(() => verifyDrPackage(packageDirectory)).toThrow(/SQA_DR_MIGRATION_HISTORY_MISSING/)
  })

  it('rejects malformed source comparison evidence', () => {
    const packageDirectory = fixtureDirectory()
    const evidence = '{"schemaVersion":1}\n'
    writeFileSync(join(packageDirectory, 'source-evidence.json'), evidence)
    const manifest = readManifest(packageDirectory)
    const entry = manifest.files.find((file: { path: string }) => file.path === 'source-evidence.json')
    entry.bytes = Buffer.byteLength(evidence)
    entry.sha256 = digest(evidence)
    writeManifest(packageDirectory, manifest)

    expect(() => verifyDrPackage(packageDirectory)).toThrow(/SQA_DR_SOURCE_EVIDENCE_INVALID/)
  })

  it.each([
    ['duplicate', 'schema.sql'],
    ['traversal', '../schema.sql'],
    ['absolute', '/schema.sql'],
  ])('rejects a %s manifest path', (_label, path) => {
    const packageDirectory = fixtureDirectory()
    const manifest = readManifest(packageDirectory)
    manifest.files.push({ ...manifest.files[1], path })
    writeManifest(packageDirectory, manifest)

    expect(() => verifyDrPackage(packageDirectory)).toThrow(/SQA_DR_FILE_PATH_INVALID|SQA_DR_FILE_PATH_DUPLICATE/)
  })

  it('rejects an empty dump', () => {
    const packageDirectory = fixtureDirectory()
    writeFileSync(join(packageDirectory, 'roles.sql'), '')
    const manifest = readManifest(packageDirectory)
    const entry = manifest.files.find((file: { path: string }) => file.path === 'roles.sql')
    entry.bytes = 0
    entry.sha256 = digest('')
    writeManifest(packageDirectory, manifest)

    expect(() => verifyDrPackage(packageDirectory)).toThrow(/SQA_DR_FILE_EMPTY/)
  })
})
