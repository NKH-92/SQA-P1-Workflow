import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const STRATEGY = 'platform_clone'
const TARGET_DISPOSITIONS = new Set(['delete_after_evidence', 'preserve_approved'])

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertSha256(value, code, detail) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(code, detail)
}

function assertDatabaseEvidence(evidence, label) {
  if (!isRecord(evidence) || evidence.schemaVersion !== 1) {
    fail('SQA_DR_DATABASE_EVIDENCE_SCHEMA', label)
  }
  if (typeof evidence.capturedAt !== 'string' || Number.isNaN(Date.parse(evidence.capturedAt))) {
    fail('SQA_DR_DATABASE_EVIDENCE_CAPTURED_AT', label)
  }
  if (!isRecord(evidence.auth) || !Number.isSafeInteger(evidence.auth.userCount)
    || evidence.auth.userCount < 0) {
    fail('SQA_DR_DATABASE_EVIDENCE_AUTH', label)
  }
  assertSha256(evidence.auth.uuidSetSha256, 'SQA_DR_DATABASE_EVIDENCE_AUTH', label)

  if (!isRecord(evidence.tables) || Object.keys(evidence.tables).length === 0) {
    fail('SQA_DR_DATABASE_EVIDENCE_TABLES', label)
  }
  for (const [table, value] of Object.entries(evidence.tables)) {
    if (!/^(public|private)\.[a-z][a-z0-9_]*$/.test(table) || !isRecord(value)
      || !Number.isSafeInteger(value.rowCount) || value.rowCount < 0) {
      fail('SQA_DR_DATABASE_EVIDENCE_TABLE', `${label}:${table}`)
    }
    assertSha256(value.canonicalSha256, 'SQA_DR_DATABASE_EVIDENCE_TABLE', `${label}:${table}`)
  }

  if (!isRecord(evidence.migrationHistory)
    || !Number.isSafeInteger(evidence.migrationHistory.versionCount)
    || evidence.migrationHistory.versionCount < 0) {
    fail('SQA_DR_DATABASE_EVIDENCE_MIGRATIONS', label)
  }
  assertSha256(
    evidence.migrationHistory.versionSetSha256,
    'SQA_DR_DATABASE_EVIDENCE_MIGRATIONS',
    label,
  )

  if (!isRecord(evidence.configuration)
    || !Number.isSafeInteger(evidence.configuration.storageObjectCount)
    || evidence.configuration.storageObjectCount < 0) {
    fail('SQA_DR_DATABASE_EVIDENCE_CONFIGURATION', label)
  }
  assertSha256(
    evidence.configuration.extensionsSha256,
    'SQA_DR_DATABASE_EVIDENCE_CONFIGURATION',
    `${label}:extensions`,
  )
  assertSha256(
    evidence.configuration.realtimePublicationsSha256,
    'SQA_DR_DATABASE_EVIDENCE_CONFIGURATION',
    `${label}:realtime`,
  )

  if (!isRecord(evidence.foreignKeyOrphans)
    || Object.keys(evidence.foreignKeyOrphans).length === 0) {
    fail('SQA_DR_DATABASE_EVIDENCE_FOREIGN_KEYS', label)
  }
  for (const [constraint, count] of Object.entries(evidence.foreignKeyOrphans)) {
    if (!/^[a-z][a-z0-9_]*$/.test(constraint) || !Number.isSafeInteger(count) || count < 0) {
      fail('SQA_DR_DATABASE_EVIDENCE_FOREIGN_KEY', `${label}:${constraint}`)
    }
  }
}

function assertSameKeys(left, right, code) {
  const leftKeys = Object.keys(left).sort()
  const rightKeys = Object.keys(right).sort()
  if (JSON.stringify(leftKeys) !== JSON.stringify(rightKeys)) fail(code, 'key set')
}

function compareDatabaseEvidence(source, target) {
  if (source.auth.userCount !== target.auth.userCount
    || source.auth.uuidSetSha256 !== target.auth.uuidSetSha256) {
    fail('SQA_DR_AUTH_EVIDENCE_MISMATCH')
  }

  assertSameKeys(source.tables, target.tables, 'SQA_DR_TABLE_EVIDENCE_MISMATCH')
  for (const table of Object.keys(source.tables)) {
    const expected = source.tables[table]
    const actual = target.tables[table]
    if (expected.rowCount !== actual.rowCount
      || expected.canonicalSha256 !== actual.canonicalSha256) {
      fail('SQA_DR_TABLE_EVIDENCE_MISMATCH', table)
    }
  }

  if (source.migrationHistory.versionCount !== target.migrationHistory.versionCount
    || source.migrationHistory.versionSetSha256 !== target.migrationHistory.versionSetSha256) {
    fail('SQA_DR_MIGRATION_EVIDENCE_MISMATCH')
  }

  if (source.configuration.extensionsSha256 !== target.configuration.extensionsSha256
    || source.configuration.realtimePublicationsSha256
      !== target.configuration.realtimePublicationsSha256
    || source.configuration.storageObjectCount !== target.configuration.storageObjectCount) {
    fail('SQA_DR_CONFIGURATION_EVIDENCE_MISMATCH')
  }
  if (target.configuration.storageObjectCount !== 0) {
    fail('SQA_DR_TARGET_STORAGE_NOT_EMPTY', String(target.configuration.storageObjectCount))
  }

  assertSameKeys(
    source.foreignKeyOrphans,
    target.foreignKeyOrphans,
    'SQA_DR_FOREIGN_KEY_EVIDENCE_MISMATCH',
  )
  for (const [constraint, count] of Object.entries(target.foreignKeyOrphans)) {
    if (count !== 0) fail('SQA_DR_TARGET_FK_ORPHAN', `${constraint}:${count}`)
  }
}

function assertSmokeEvidence(smoke) {
  if (!isRecord(smoke) || smoke.schemaVersion !== 1) fail('SQA_DR_SMOKE_EVIDENCE_SCHEMA')
  if (smoke.strategy !== STRATEGY) fail('SQA_DR_STRATEGY_UNSUPPORTED', String(smoke.strategy))
  if (!PROJECT_REF_PATTERN.test(smoke.targetProjectRef)
    || !PROJECT_REF_PATTERN.test(smoke.productionProjectRef)) {
    fail('SQA_DR_PROJECT_REF_INVALID')
  }
  if (smoke.targetProjectRef === smoke.productionProjectRef) fail('SQA_DR_TARGET_IS_PRODUCTION')
  if (!Array.isArray(smoke.allowedTargetRefs)
    || !smoke.allowedTargetRefs.includes(smoke.targetProjectRef)) {
    fail('SQA_DR_TARGET_NOT_ALLOWLISTED')
  }
  if (!TARGET_DISPOSITIONS.has(smoke.targetDisposition)) {
    fail('SQA_DR_TARGET_DISPOSITION_INVALID', String(smoke.targetDisposition))
  }

  const settings = smoke.authSettings
  const rls = smoke.rls
  const passed = smoke.preservedLogin === true
    && smoke.preservedUserIdMatches === true
    && isRecord(settings)
    && settings.signupDisabled === true
    && settings.emailProviderEnabled === true
    && settings.emailConfirmationRequired === true
    && settings.anonymousUsersDisabled === true
    && isRecord(rls)
    && rls.passed === true
    && Number.isSafeInteger(rls.testFiles)
    && rls.testFiles > 0
    && rls.skippedTests === 0
    && smoke.audit === true
    && smoke.reviewLifecycle === true
    && smoke.changeTaskAuthorization === true
    && smoke.secretsExposed === false
  if (!passed) fail('SQA_DR_SMOKE_EVIDENCE_FAILED')
}

export function verifyRestoredProject({
  sourceEvidence,
  targetEvidence,
  smokeEvidence,
  verifiedAt = new Date().toISOString(),
}) {
  assertDatabaseEvidence(sourceEvidence, 'source')
  assertDatabaseEvidence(targetEvidence, 'target')
  assertSmokeEvidence(smokeEvidence)
  compareDatabaseEvidence(sourceEvidence, targetEvidence)
  return {
    schemaVersion: 1,
    strategy: STRATEGY,
    targetProjectRef: smokeEvidence.targetProjectRef,
    verifiedAt,
    passed: true,
    checks: {
      authUuidSetExact: true,
      profileAndCoreRowsExact: true,
      canonicalChecksumsExact: true,
      migrationHistoryExact: true,
      extensionsAndRealtimeExact: true,
      storageObjectCountZero: true,
      foreignKeyOrphansZero: true,
      preservedLogin: true,
      authSettings: true,
      rlsNoSkips: true,
      audit: true,
      reviewLifecycle: true,
      changeTaskAuthorization: true,
      logRedaction: true,
    },
    targetDisposition: smokeEvidence.targetDisposition,
  }
}

function parseArguments(args) {
  const values = {}
  const remaining = [...args]
  while (remaining.length > 0) {
    const key = remaining.shift()
    const value = remaining.shift()
    if (!key?.startsWith('--') || value === undefined) fail('SQA_DR_ARGUMENT_INVALID', String(key))
    values[key.slice(2)] = value
  }
  for (const required of ['source', 'target', 'smoke', 'output']) {
    if (!values[required]) fail('SQA_DR_ARGUMENT_REQUIRED', required)
  }
  return values
}

function readJson(path, label) {
  try {
    return JSON.parse(readFileSync(resolve(path), 'utf8'))
  } catch (error) {
    fail('SQA_DR_EVIDENCE_FILE_INVALID', `${label}:${error instanceof Error ? error.message : String(error)}`)
  }
}

function runCli() {
  const options = parseArguments(process.argv.slice(2))
  const result = verifyRestoredProject({
    sourceEvidence: readJson(options.source, 'source'),
    targetEvidence: readJson(options.target, 'target'),
    smokeEvidence: readJson(options.smoke, 'smoke'),
  })
  writeFileSync(resolve(options.output), `${JSON.stringify(result, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  process.stdout.write(`SQA_DR_RESTORED_PROJECT_OK target=${result.targetProjectRef}\n`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    runCli()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
