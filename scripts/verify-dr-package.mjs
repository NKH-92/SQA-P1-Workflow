import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, writeFileSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const MANIFEST_FILE = 'dr-manifest.json'
const REQUIRED_FILES = [
  'roles.sql',
  'schema.sql',
  'data.sql',
  'migration-history.sql',
  'source-evidence.json',
]
const REQUIRED_OBJECTS = [
  'public.profiles',
  'private.audit_events',
  'supabase_migrations.schema_migrations',
]
const CAPABILITY_KEYS = [
  'authSettingsIncluded',
  'realtimeSettingsIncluded',
  'extensionSettingsIncluded',
  'storageObjectsIncluded',
  'storageSettingsIncluded',
  'edgeFunctionsIncluded',
  'workerConfigIncluded',
  'loginRlsSmokeVerified',
]
const CLASS_REQUIREMENTS = {
  L1: [],
  L2: [],
  L3: [
    'authIdentityIncluded',
    'authSettingsIncluded',
    'realtimeSettingsIncluded',
    'extensionSettingsIncluded',
  ],
  L4: [
    'authIdentityIncluded',
    'authSettingsIncluded',
    'realtimeSettingsIncluded',
    'extensionSettingsIncluded',
    'storageObjectsIncluded',
    'storageSettingsIncluded',
    'edgeFunctionsIncluded',
    'workerConfigIncluded',
    'loginRlsSmokeVerified',
  ],
}
const CLASS_FILES = {
  L1: [],
  L2: [],
  L3: ['auth.sql', 'auth-settings.json', 'realtime-settings.json', 'extensions.sql'],
  L4: [
    'auth.sql',
    'auth-settings.json',
    'realtime-settings.json',
    'extensions.sql',
    'storage-objects.json',
    'storage-settings.json',
    'edge-functions.json',
    'worker-config.json',
    'rehearsal-evidence.json',
  ],
}

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function normalizeSql(contents) {
  return contents.replaceAll('"', '').replace(/\s+/g, ' ').toLowerCase()
}

function hasCreatedTable(contents, qualifiedName) {
  const sql = normalizeSql(contents)
  return new RegExp(`create table(?: if not exists)? ${qualifiedName.replace('.', '\\.')}\\b`).test(sql)
}

function hasDataFor(contents, qualifiedName) {
  const sql = normalizeSql(contents)
  const escaped = qualifiedName.replace('.', '\\.')
  return new RegExp(`(?:copy|insert into) ${escaped}\\b`).test(sql)
}

function assertSafePath(path, seen) {
  if (typeof path !== 'string' || path.length === 0 || isAbsolute(path)
    || path.includes('/') || path.includes('\\') || path === '.' || path === '..') {
    fail('SQA_DR_FILE_PATH_INVALID', String(path))
  }
  const comparisonKey = path.toLowerCase()
  if (seen.has(comparisonKey)) fail('SQA_DR_FILE_PATH_DUPLICATE', path)
  seen.add(comparisonKey)
}

function readManifest(packageDirectory) {
  const manifestPath = resolve(packageDirectory, MANIFEST_FILE)
  let parsed
  try {
    parsed = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail('SQA_DR_MANIFEST_INVALID', error instanceof Error ? error.message : String(error))
  }
  return parsed
}

function validateManifestSchema(manifest) {
  if (!isRecord(manifest)) fail('SQA_DR_MANIFEST_INVALID', 'root must be an object')
  if (manifest.schemaVersion !== 1) fail('SQA_DR_MANIFEST_SCHEMA_VERSION', String(manifest.schemaVersion))
  if (typeof manifest.sourceSha !== 'string' || !/^[0-9a-f]{40}$/i.test(manifest.sourceSha)) {
    fail('SQA_DR_MANIFEST_SOURCE_SHA', String(manifest.sourceSha))
  }
  if (typeof manifest.createdAt !== 'string' || Number.isNaN(Date.parse(manifest.createdAt))) {
    fail('SQA_DR_MANIFEST_CREATED_AT', String(manifest.createdAt))
  }
  if (!(manifest.backupClass in CLASS_REQUIREMENTS)) {
    fail('SQA_DR_MANIFEST_BACKUP_CLASS', String(manifest.backupClass))
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    fail('SQA_DR_MANIFEST_FILES')
  }
  if (!isRecord(manifest.requiredObjects)) fail('SQA_DR_MANIFEST_REQUIRED_OBJECTS')
  for (const name of REQUIRED_OBJECTS) {
    if (typeof manifest.requiredObjects[name] !== 'boolean') {
      fail('SQA_DR_MANIFEST_REQUIRED_OBJECT', name)
    }
  }
  if (typeof manifest.authIdentityIncluded !== 'boolean') fail('SQA_DR_MANIFEST_AUTH_IDENTITY')
  if (!Number.isSafeInteger(manifest.storageObjectCount) || manifest.storageObjectCount < 0) {
    fail('SQA_DR_MANIFEST_STORAGE_COUNT', String(manifest.storageObjectCount))
  }
  if (!isRecord(manifest.capabilities)) fail('SQA_DR_MANIFEST_CAPABILITIES')
  for (const key of CAPABILITY_KEYS) {
    if (typeof manifest.capabilities[key] !== 'boolean') fail('SQA_DR_MANIFEST_CAPABILITY', key)
  }
}

function verifyFiles(packageDirectory, manifest) {
  const seen = new Set()
  const contents = new Map()
  for (const entry of manifest.files) {
    if (!isRecord(entry)) fail('SQA_DR_FILE_ENTRY_INVALID')
    assertSafePath(entry.path, seen)
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) fail('SQA_DR_FILE_EMPTY', entry.path)
    if (typeof entry.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.sha256)) {
      fail('SQA_DR_FILE_SHA256_INVALID', entry.path)
    }
    const absolutePath = resolve(packageDirectory, entry.path)
    let stat
    let buffer
    try {
      stat = lstatSync(absolutePath)
      buffer = readFileSync(absolutePath)
    } catch (error) {
      fail('SQA_DR_FILE_MISSING', `${entry.path}: ${error instanceof Error ? error.message : String(error)}`)
    }
    if (!stat.isFile() || stat.isSymbolicLink()) fail('SQA_DR_FILE_TYPE_INVALID', entry.path)
    if (stat.size <= 0 || entry.bytes <= 0) fail('SQA_DR_FILE_EMPTY', entry.path)
    if (stat.size !== entry.bytes) fail('SQA_DR_FILE_BYTES_MISMATCH', entry.path)
    if (sha256(buffer) !== entry.sha256.toLowerCase()) fail('SQA_DR_FILE_SHA256_MISMATCH', entry.path)
    contents.set(entry.path, buffer.toString('utf8'))
  }

  for (const requiredFile of REQUIRED_FILES) {
    if (!seen.has(requiredFile.toLowerCase())) fail('SQA_DR_REQUIRED_FILE_MISSING', requiredFile)
  }
  return contents
}

function verifyRequiredObjects(manifest, contents) {
  const roles = normalizeSql(contents.get('roles.sql') ?? '')
  const schema = contents.get('schema.sql') ?? ''
  const data = contents.get('data.sql') ?? ''
  const migrationHistory = contents.get('migration-history.sql') ?? ''
  let sourceEvidence
  try {
    sourceEvidence = JSON.parse(contents.get('source-evidence.json') ?? '')
  } catch {
    fail('SQA_DR_SOURCE_EVIDENCE_INVALID')
  }
  if (!isRecord(sourceEvidence) || sourceEvidence.schemaVersion !== 1
    || !isRecord(sourceEvidence.auth) || !isRecord(sourceEvidence.tables)
    || !isRecord(sourceEvidence.migrationHistory)
    || !isRecord(sourceEvidence.configuration)
    || !isRecord(sourceEvidence.foreignKeyOrphans)) {
    fail('SQA_DR_SOURCE_EVIDENCE_INVALID')
  }
  const actual = {
    'public.profiles': hasCreatedTable(schema, 'public.profiles'),
    'private.audit_events': hasCreatedTable(schema, 'private.audit_events'),
    'supabase_migrations.schema_migrations': hasDataFor(
      migrationHistory,
      'supabase_migrations.schema_migrations',
    ),
  }

  if (!roles.includes('create role ') && !roles.includes('alter role ')) {
    fail('SQA_DR_ROLE_FORM_MISSING')
  }
  if (!actual['supabase_migrations.schema_migrations']) fail('SQA_DR_MIGRATION_HISTORY_MISSING')
  if (!hasDataFor(data, 'public.profiles')) fail('SQA_DR_DATA_FORM_MISSING', 'public.profiles')
  for (const name of REQUIRED_OBJECTS) {
    if (manifest.requiredObjects[name] !== actual[name]) {
      fail('SQA_DR_REQUIRED_OBJECT_MISMATCH', name)
    }
  }
  if (!actual['public.profiles']) fail('SQA_DR_REQUIRED_OBJECT_MISSING', 'public.profiles')
  if (manifest.backupClass !== 'L1' && !actual['private.audit_events']) {
    fail('SQA_DR_REQUIRED_OBJECT_MISSING', 'private.audit_events')
  }
}

function verifyBackupClass(manifest, contents) {
  for (const requirement of CLASS_REQUIREMENTS[manifest.backupClass]) {
    const included = requirement === 'authIdentityIncluded'
      ? manifest.authIdentityIncluded
      : manifest.capabilities[requirement]
    if (!included) {
      const code = requirement === 'authIdentityIncluded'
        ? 'SQA_DR_CLASS_AUTH_IDENTITY_REQUIRED'
        : 'SQA_DR_CLASS_CAPABILITY_REQUIRED'
      fail(code, `${manifest.backupClass}:${requirement}`)
    }
  }
  for (const requiredFile of CLASS_FILES[manifest.backupClass]) {
    if (!contents.has(requiredFile)) fail('SQA_DR_CLASS_FILE_REQUIRED', `${manifest.backupClass}:${requiredFile}`)
  }

  if (manifest.backupClass === 'L3' || manifest.backupClass === 'L4') {
    const auth = normalizeSql(contents.get('auth.sql') ?? '')
    if (!auth.includes('auth.users') || !auth.includes('encrypted_password')) {
      fail('SQA_DR_AUTH_IDENTITY_CONTENT_INVALID')
    }
  }
}

export function verifyDrPackage(packageDirectory) {
  const absoluteDirectory = resolve(packageDirectory)
  const manifest = readManifest(absoluteDirectory)
  validateManifestSchema(manifest)
  const contents = verifyFiles(absoluteDirectory, manifest)
  verifyRequiredObjects(manifest, contents)
  verifyBackupClass(manifest, contents)
  return manifest
}

function inspectRequiredObjects(packageDirectory) {
  const schema = readFileSync(resolve(packageDirectory, 'schema.sql'), 'utf8')
  const migrationHistory = readFileSync(resolve(packageDirectory, 'migration-history.sql'), 'utf8')
  return {
    'public.profiles': hasCreatedTable(schema, 'public.profiles'),
    'private.audit_events': hasCreatedTable(schema, 'private.audit_events'),
    'supabase_migrations.schema_migrations': hasDataFor(
      migrationHistory,
      'supabase_migrations.schema_migrations',
    ),
  }
}

export function createDrManifest({
  packageDirectory,
  sourceSha,
  createdAt,
  backupClass,
  authIdentityIncluded,
  storageObjectCount,
  capabilities = {},
}) {
  const absoluteDirectory = resolve(packageDirectory)
  const files = REQUIRED_FILES.map((path) => {
    const buffer = readFileSync(resolve(absoluteDirectory, path))
    return { path, sha256: sha256(buffer), bytes: buffer.byteLength }
  })
  const manifest = {
    schemaVersion: 1,
    sourceSha,
    createdAt,
    backupClass,
    files,
    requiredObjects: inspectRequiredObjects(absoluteDirectory),
    authIdentityIncluded,
    storageObjectCount,
    capabilities: Object.fromEntries(CAPABILITY_KEYS.map((key) => [key, capabilities[key] === true])),
  }
  writeFileSync(resolve(absoluteDirectory, MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  verifyDrPackage(absoluteDirectory)
  return manifest
}

function parseArguments(arguments_) {
  const options = { mode: 'verify', packageDirectory: '' }
  const args = [...arguments_]
  if (args[0] === '--write-manifest') {
    options.mode = 'write'
    args.shift()
  }
  options.packageDirectory = args.shift() ?? ''
  while (args.length > 0) {
    const key = args.shift()
    const value = args.shift()
    if (!key?.startsWith('--') || value === undefined) fail('SQA_DR_ARGUMENT_INVALID', String(key))
    options[key.slice(2)] = value
  }
  if (!options.packageDirectory) fail('SQA_DR_ARGUMENT_PACKAGE_REQUIRED')
  return options
}

function parseBoolean(value, name) {
  if (value === 'true') return true
  if (value === 'false') return false
  fail('SQA_DR_ARGUMENT_BOOLEAN', name)
}

function runCli() {
  const options = parseArguments(process.argv.slice(2))
  let manifest
  if (options.mode === 'write') {
    manifest = createDrManifest({
      packageDirectory: options.packageDirectory,
      sourceSha: options['source-sha'],
      createdAt: options['created-at'],
      backupClass: options['backup-class'],
      authIdentityIncluded: parseBoolean(options['auth-identity-included'], 'auth-identity-included'),
      storageObjectCount: Number(options['storage-object-count']),
    })
  } else {
    manifest = verifyDrPackage(options.packageDirectory)
  }
  process.stdout.write(
    `SQA_DR_PACKAGE_OK class=${manifest.backupClass} sha=${manifest.sourceSha} files=${manifest.files.length}\n`,
  )
}

const invokedAsScript = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (invokedAsScript) {
  try {
    runCli()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
