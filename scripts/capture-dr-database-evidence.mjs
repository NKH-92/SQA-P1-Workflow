import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const TABLES = [
  'public.profiles',
  'public.products',
  'public.review_requests',
  'public.review_feedback',
  'public.review_events',
  'public.change_applications',
  'public.product_change_tasks',
  'private.audit_events',
]
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/
const DOCKER_CONTAINER_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.-]*$/

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`)
}

function sha256Rows(rows) {
  return createHash('sha256').update(rows.join('\n')).digest('hex')
}

function assertStringRows(rows, label, { sortedUnique = false } = {}) {
  if (!Array.isArray(rows) || rows.some((row) => typeof row !== 'string')) {
    fail('SQA_DR_CAPTURE_ROWS_INVALID', label)
  }
  if (sortedUnique) {
    const expected = [...new Set(rows)].sort()
    if (JSON.stringify(rows) !== JSON.stringify(expected)) {
      fail('SQA_DR_CAPTURE_ROWS_NOT_SORTED_UNIQUE', label)
    }
  }
}

export function buildDatabaseEvidence({
  capturedAt,
  authRows,
  tableRows,
  migrationRows,
  extensionRows,
  realtimeRows,
  storageObjectCount,
  foreignKeyOrphans,
}) {
  if (typeof capturedAt !== 'string' || Number.isNaN(Date.parse(capturedAt))) {
    fail('SQA_DR_CAPTURE_TIMESTAMP_INVALID')
  }
  assertStringRows(authRows, 'auth', { sortedUnique: true })
  assertStringRows(migrationRows, 'migrations', { sortedUnique: true })
  assertStringRows(extensionRows, 'extensions', { sortedUnique: true })
  assertStringRows(realtimeRows, 'realtime', { sortedUnique: true })
  if (!tableRows || typeof tableRows !== 'object' || Array.isArray(tableRows)
    || Object.keys(tableRows).length === 0) {
    fail('SQA_DR_CAPTURE_TABLES_INVALID')
  }
  const tables = {}
  for (const [table, rows] of Object.entries(tableRows)) {
    if (!/^(public|private)\.[a-z][a-z0-9_]*$/.test(table)) {
      fail('SQA_DR_CAPTURE_TABLE_NAME_INVALID', table)
    }
    assertStringRows(rows, table)
    tables[table] = { rowCount: rows.length, canonicalSha256: sha256Rows(rows) }
  }
  if (!Number.isSafeInteger(storageObjectCount) || storageObjectCount !== 0) {
    fail('SQA_DR_CAPTURE_STORAGE_NOT_EMPTY', String(storageObjectCount))
  }
  if (!foreignKeyOrphans || typeof foreignKeyOrphans !== 'object'
    || Array.isArray(foreignKeyOrphans) || Object.keys(foreignKeyOrphans).length === 0) {
    fail('SQA_DR_CAPTURE_FOREIGN_KEYS_INVALID')
  }
  for (const [constraint, count] of Object.entries(foreignKeyOrphans)) {
    if (!IDENTIFIER_PATTERN.test(constraint) || !Number.isSafeInteger(count) || count !== 0) {
      fail('SQA_DR_CAPTURE_FK_ORPHAN', `${constraint}:${count}`)
    }
  }

  return {
    schemaVersion: 1,
    capturedAt,
    auth: { userCount: authRows.length, uuidSetSha256: sha256Rows(authRows) },
    tables,
    migrationHistory: {
      versionCount: migrationRows.length,
      versionSetSha256: sha256Rows(migrationRows),
    },
    configuration: {
      extensionsSha256: sha256Rows(extensionRows),
      realtimePublicationsSha256: sha256Rows(realtimeRows),
      storageObjectCount,
    },
    foreignKeyOrphans,
  }
}

function outputRows(stdout) {
  const normalized = stdout.replace(/\r\n?/g, '\n').trimEnd()
  return normalized === '' ? [] : normalized.split('\n')
}

export function assertDockerContainerName(dockerContainer) {
  if (dockerContainer && !DOCKER_CONTAINER_PATTERN.test(dockerContainer)) {
    fail('SQA_DR_CAPTURE_DOCKER_CONTAINER_INVALID')
  }
}

function createPsqlRunner(databaseUrl) {
  const dockerContainer = process.env.DR_PSQL_DOCKER_CONTAINER
  assertDockerContainerName(dockerContainer)
  const command = dockerContainer ? 'docker' : 'psql'
  const prefix = dockerContainer ? ['exec', dockerContainer, 'psql'] : []
  return (sql) => {
    const result = spawnSync(command, [
      ...prefix,
      '--no-psqlrc',
      '--tuples-only',
      '--no-align',
      '--set',
      'ON_ERROR_STOP=1',
      '--dbname',
      databaseUrl,
      '--command',
      sql,
    ], {
      encoding: 'utf8',
      env: { ...process.env, PGCONNECT_TIMEOUT: '15' },
      maxBuffer: 128 * 1024 * 1024,
    })
    if (result.error || result.status !== 0) {
      fail('SQA_DR_CAPTURE_PSQL_FAILED', `exit=${result.status ?? 'spawn'}`)
    }
    return outputRows(result.stdout)
  }
}

function splitQualifiedName(name) {
  const [schema, table] = name.split('.')
  if (!IDENTIFIER_PATTERN.test(schema) || !IDENTIFIER_PATTERN.test(table)) {
    fail('SQA_DR_CAPTURE_IDENTIFIER_INVALID', name)
  }
  return { schema, table }
}

function quoteIdentifier(identifier) {
  if (!IDENTIFIER_PATTERN.test(identifier)) fail('SQA_DR_CAPTURE_IDENTIFIER_INVALID', identifier)
  return `"${identifier}"`
}

function captureForeignKeyOrphans(query) {
  const metadataRows = query(`
    select concat_ws(E'\\t',
      c.conname,
      source_ns.nspname,
      source_table.relname,
      source_column.attname,
      target_ns.nspname,
      target_table.relname,
      target_column.attname)
    from pg_constraint c
    join pg_class source_table on source_table.oid = c.conrelid
    join pg_namespace source_ns on source_ns.oid = source_table.relnamespace
    join pg_class target_table on target_table.oid = c.confrelid
    join pg_namespace target_ns on target_ns.oid = target_table.relnamespace
    join pg_attribute source_column
      on source_column.attrelid = c.conrelid and source_column.attnum = c.conkey[1]
    join pg_attribute target_column
      on target_column.attrelid = c.confrelid and target_column.attnum = c.confkey[1]
    where c.contype = 'f'
      and cardinality(c.conkey) = 1
      and source_ns.nspname in ('public', 'private')
      and target_ns.nspname in ('auth', 'public', 'private')
    order by source_ns.nspname, source_table.relname, c.conname;
  `)
  if (metadataRows.length === 0) fail('SQA_DR_CAPTURE_FOREIGN_KEYS_MISSING')

  const result = {}
  for (const row of metadataRows) {
    const parts = row.split('\t')
    if (parts.length !== 7 || parts.some((part) => !IDENTIFIER_PATTERN.test(part))) {
      fail('SQA_DR_CAPTURE_FOREIGN_KEY_METADATA_INVALID')
    }
    const [constraint, sourceSchema, sourceTable, sourceColumn, targetSchema, targetTable, targetColumn] = parts
    if (constraint in result) fail('SQA_DR_CAPTURE_FOREIGN_KEY_DUPLICATE', constraint)
    const countRows = query(`
      select count(*)::text
      from ${quoteIdentifier(sourceSchema)}.${quoteIdentifier(sourceTable)} source_row
      left join ${quoteIdentifier(targetSchema)}.${quoteIdentifier(targetTable)} target_row
        on source_row.${quoteIdentifier(sourceColumn)} = target_row.${quoteIdentifier(targetColumn)}
      where source_row.${quoteIdentifier(sourceColumn)} is not null
        and target_row.${quoteIdentifier(targetColumn)} is null;
    `)
    if (countRows.length !== 1 || !/^\d+$/.test(countRows[0])) {
      fail('SQA_DR_CAPTURE_FOREIGN_KEY_COUNT_INVALID', constraint)
    }
    result[constraint] = Number(countRows[0])
  }
  return result
}

export function captureDatabaseEvidence({ databaseUrl, capturedAt }) {
  if (typeof databaseUrl !== 'string' || databaseUrl.length === 0) {
    fail('SQA_DR_CAPTURE_DATABASE_URL_REQUIRED')
  }
  const query = createPsqlRunner(databaseUrl)
  const tableRows = {}
  for (const name of TABLES) {
    const { schema, table } = splitQualifiedName(name)
    tableRows[name] = query(`
      select row_to_json(canonical_row)::text
      from (
        select * from ${quoteIdentifier(schema)}.${quoteIdentifier(table)} order by id
      ) canonical_row;
    `)
  }
  const storageCountRows = query('select count(*)::text from storage.objects;')
  if (storageCountRows.length !== 1 || !/^\d+$/.test(storageCountRows[0])) {
    fail('SQA_DR_CAPTURE_STORAGE_COUNT_INVALID')
  }
  return buildDatabaseEvidence({
    capturedAt,
    authRows: query('select id::text from auth.users order by id;'),
    tableRows,
    migrationRows: query('select version::text from supabase_migrations.schema_migrations order by version;'),
    extensionRows: query("select extname || '=' || extversion from pg_extension order by extname;"),
    realtimeRows: query("select schemaname || '.' || tablename from pg_publication_tables where pubname = 'supabase_realtime' order by schemaname, tablename;"),
    storageObjectCount: Number(storageCountRows[0]),
    foreignKeyOrphans: captureForeignKeyOrphans(query),
  })
}

export function assertDatabaseUrlProjectRef(databaseUrl, expectedProjectRef) {
  if (!PROJECT_REF_PATTERN.test(expectedProjectRef)) fail('SQA_DR_CAPTURE_PROJECT_REF_INVALID')
  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    fail('SQA_DR_CAPTURE_DATABASE_URL_INVALID')
  }
  const directHostMatches = parsed.hostname === `db.${expectedProjectRef}.supabase.co`
  const poolerUserMatches = decodeURIComponent(parsed.username) === `postgres.${expectedProjectRef}`
  if (!directHostMatches && !poolerUserMatches) {
    fail('SQA_DR_CAPTURE_DATABASE_TARGET_MISMATCH')
  }
}

function parseArguments(args) {
  const options = {}
  const remaining = [...args]
  while (remaining.length > 0) {
    const key = remaining.shift()
    const value = remaining.shift()
    if (!key?.startsWith('--') || value === undefined) fail('SQA_DR_CAPTURE_ARGUMENT_INVALID', String(key))
    options[key.slice(2)] = value
  }
  if (!options.output) fail('SQA_DR_CAPTURE_ARGUMENT_REQUIRED', 'output')
  return options
}

function runCli() {
  const options = parseArguments(process.argv.slice(2))
  if (process.env.DR_EXPECTED_PROJECT_REF) {
    assertDatabaseUrlProjectRef(process.env.DATABASE_URL, process.env.DR_EXPECTED_PROJECT_REF)
  }
  const evidence = captureDatabaseEvidence({
    databaseUrl: process.env.DATABASE_URL,
    capturedAt: options['captured-at'] ?? new Date().toISOString(),
  })
  writeFileSync(resolve(options.output), `${JSON.stringify(evidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  process.stdout.write(`SQA_DR_DATABASE_EVIDENCE_OK tables=${Object.keys(evidence.tables).length}\n`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    runCli()
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
