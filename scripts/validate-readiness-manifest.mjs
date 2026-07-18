import { readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function assertUnique(values, label) {
  if (new Set(values).size !== values.length) {
    throw new Error(`SQA_DB_READY_MANIFEST_DUPLICATE: ${label}`)
  }
}

function assertExact(actual, expected, label) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(
      `SQA_DB_READY_MANIFEST_MISMATCH: ${label}\nexpected=${JSON.stringify(expected)}\nactual=${JSON.stringify(actual)}`,
    )
  }
}

export function validateReadinessManifest(root = repositoryRoot) {
  const verifyDirectory = resolve(root, 'scripts/sql/verify')
  const manifest = JSON.parse(readFileSync(resolve(verifyDirectory, 'manifest.json'), 'utf8'))
  if (manifest.schemaVersion !== 1) {
    throw new Error('SQA_DB_READY_MANIFEST_SCHEMA: expected schemaVersion 1')
  }

  const readinessFiles = manifest.readinessFiles
  const migrationVersions = manifest.migrationVersions
  if (!Array.isArray(readinessFiles) || !Array.isArray(migrationVersions)) {
    throw new Error('SQA_DB_READY_MANIFEST_SCHEMA: readinessFiles and migrationVersions must be arrays')
  }
  assertUnique(readinessFiles, 'readinessFiles')
  assertUnique(migrationVersions, 'migrationVersions')

  for (const file of readinessFiles) {
    if (typeof file !== 'string' || !/^\d{2}_[a-z0-9_]+\.sql$/.test(file)) {
      throw new Error(`SQA_DB_READY_MANIFEST_PATH: ${String(file)}`)
    }
  }
  for (const version of migrationVersions) {
    if (typeof version !== 'string' || !/^\d{12,14}$/.test(version)) {
      throw new Error(`SQA_DB_READY_MANIFEST_VERSION: ${String(version)}`)
    }
  }

  const actualReadinessFiles = readdirSync(verifyDirectory)
    .filter((name) => /^\d{2}_.+\.sql$/.test(name))
    .sort()
  const actualMigrationVersions = readdirSync(resolve(root, 'supabase/migrations'))
    .filter((name) => /^\d{12,14}_.+\.sql$/.test(name))
    .map((name) => name.split('_', 1)[0])
    .sort()

  assertExact(readinessFiles, [...readinessFiles].sort(), 'readinessFiles order')
  assertExact(migrationVersions, [...migrationVersions].sort(), 'migrationVersions order')
  assertExact(actualReadinessFiles, readinessFiles, 'readiness SQL set')
  assertExact(actualMigrationVersions, migrationVersions, 'migration version set')

  return { readinessFiles, migrationVersions }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = validateReadinessManifest()
  console.log(`Readiness manifest OK: ${result.readinessFiles.length} SQL files, ${result.migrationVersions.length} migrations`)
}
