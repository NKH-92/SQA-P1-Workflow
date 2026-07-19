import {
  existsSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateReadinessManifest } from './validate-readiness-manifest.mjs'

const root = resolve(import.meta.dirname, '..')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const directSupabase = process.env.SUPABASE_BIN === 'supabase'
const supabaseCommand = directSupabase ? 'supabase' : npx
const supabasePrefix = directSupabase ? [] : ['--yes', 'supabase@2.109.1']

function run(command, args, options = {}) {
  let executable = command
  let executableArgs = args
  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)) {
    const quote = (value) => {
      if (value.includes('"')) throw new Error('SQA_RLS_GATE_UNSAFE_WINDOWS_ARGUMENT')
      return /[\s&()<>^|]/.test(value) ? `"${value}"` : value
    }
    executable = process.env.ComSpec ?? 'cmd.exe'
    executableArgs = ['/d', '/s', '/c', [command, ...args].map(quote).join(' ')]
  }
  const result = spawnSync(executable, executableArgs, {
    cwd: root,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: { ...process.env, ...options.env },
  })
  if (result.error) throw result.error
  if (result.status !== 0 && !options.allowFailure) {
    if (options.capture) {
      process.stdout.write(result.stdout ?? '')
      process.stderr.write(result.stderr ?? '')
    }
    throw new Error(`SQA_RLS_GATE_COMMAND_FAILED: ${command} ${args.join(' ')} (${result.status})`)
  }
  return result
}

function runSupabase(args, options) {
  return run(supabaseCommand, [...supabasePrefix, ...args], options)
}

function toRootRelativePath(file) {
  const relativePath = relative(root, file)
  if (
    !relativePath
    || relativePath === '..'
    || relativePath.startsWith(`..${sep}`)
    || isAbsolute(relativePath)
  ) {
    throw new Error(`SQA_RLS_GATE_SQL_OUTSIDE_ROOT: ${file}`)
  }
  return relativePath
}

function readCanonicalStatements(file) {
  const source = readFileSync(file, 'utf8').replace(/\r\n?/g, '\n')
  const blockPattern = /(?:^|\n)\s*(do\s+\$verify\$[\s\S]*?\$verify\$;)/gi
  const statements = [...source.matchAll(blockPattern)].map((match) => match[1])
  const remainder = source
    .replace(blockPattern, '\n')
    .replace(/^\s*--.*$/gm, '')
    .trim()
  if (statements.length === 0 || remainder) {
    throw new Error(`SQA_RLS_GATE_UNSUPPORTED_CANONICAL_SQL: ${file}`)
  }
  return statements
}

function runCanonicalSql(file, directory) {
  const statements = readCanonicalStatements(file)
  statements.forEach((statement, index) => {
    const statementFile = resolve(
      directory,
      `${basename(file, '.sql')}-${String(index + 1).padStart(2, '0')}.sql`,
    )
    writeFileSync(statementFile, `${statement}\n`)
    runSupabase(['db', 'query', '--local', '--file', toRootRelativePath(statementFile)])
  })
}

function parseEnvironment(output) {
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(?:"([^"]*)"|(.*))$/)
    if (match) values[match[1]] = match[2] ?? match[3] ?? ''
  }
  for (const required of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL']) {
    if (!values[required]) throw new Error(`SQA_RLS_GATE_STATUS_ENV_MISSING: ${required}`)
  }
  return values
}

function holdMigrations(directory) {
  const names = [
    '20260718073243_finalize_review_workflow_hardening.sql',
    '20260718123250_remove_obsolete_review_status_rpc.sql',
  ]
  const held = []
  for (const name of names) {
    const source = resolve(root, 'supabase/migrations', name)
    if (!existsSync(source)) throw new Error(`SQA_RLS_GATE_MIGRATION_MISSING: ${name}`)
    const destination = join(directory, name)
    renameSync(source, destination)
    held.push({ source, destination })
  }
  return held
}

function restoreMigrations(held) {
  for (const { source, destination } of held) {
    if (existsSync(destination) && !existsSync(source)) renameSync(destination, source)
  }
}

// Keep held migrations on the repository volume so rename remains atomic on Windows.
const temporaryDirectory = mkdtempSync(resolve(root, '.sqa-local-rls-'))
let heldMigrations = []

try {
  validateReadinessManifest(root)
  runSupabase(['stop', '--no-backup'], { allowFailure: true })
  heldMigrations = holdMigrations(temporaryDirectory)
  runSupabase(['start'])
  restoreMigrations(heldMigrations)

  let status = parseEnvironment(runSupabase(['status', '-o', 'env'], { capture: true }).stdout)
  run(process.execPath, [
    'scripts/purge-review-attachments.mjs',
    '--execute',
    '--confirm=PURGE_REVIEW_ATTACHMENTS',
  ], {
    env: {
      SUPABASE_URL: status.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    },
  })

  runSupabase(['migration', 'up', '--local', '--include-all'])
  status = parseEnvironment(runSupabase(['status', '-o', 'env'], { capture: true }).stdout)

  const fixtureResult = run(process.execPath, ['scripts/setup-rls-fixtures.mjs'], {
    capture: true,
    env: {
      SUPABASE_URL: status.API_URL,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    },
  })
  process.stdout.write(fixtureResult.stdout)
  const fixtureEnvironment = Object.fromEntries(
    fixtureResult.stdout.split(/\r?\n/)
      .map((line) => line.match(/^([A-Z0-9_]+)=(.*)$/))
      .filter(Boolean)
      .map((match) => [match[1], match[2]]),
  )

  const testEnvironment = {
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: status.DB_URL,
    ...fixtureEnvironment,
  }
  run(npm, ['run', 'test:rls'], { env: testEnvironment })

  const evidenceSql = resolve(temporaryDirectory, 'private-evidence.sql')
  writeFileSync(evidenceSql, `
do $verify$
begin
  if (select count(*) from private.review_status_events) < 1 then
    raise exception 'SQA_RLS_STATUS_EVIDENCE_MISSING';
  end if;
  if (select count(*) from private.audit_events) < 1 then
    raise exception 'SQA_RLS_AUDIT_EVIDENCE_MISSING';
  end if;
end
$verify$;
`)
  // Supabase CLI 2.109.1 preserves surrounding quotes as filename bytes when
  // npx.cmd receives an absolute Windows path containing spaces. All gate SQL
  // lives below the repository root, so pass guarded cwd-relative paths.
  runSupabase(['db', 'query', '--local', '--file', toRootRelativePath(evidenceSql)])

  const { readinessFiles } = validateReadinessManifest(root)
  for (const file of readinessFiles) {
    const verificationSql = resolve(root, 'scripts/sql/verify', file)
    // db query executes through a prepared statement and therefore accepts one
    // command per file. Canonical files deliberately group multiple fail-closed
    // DO blocks, so validate their shape and execute each block independently.
    runCanonicalSql(verificationSql, temporaryDirectory)
  }
  console.log(`SQA_RLS_GATE_OK: ${readinessFiles.length} canonical SQL files`)
} finally {
  restoreMigrations(heldMigrations)
  runSupabase(['stop', '--no-backup'], { allowFailure: true })
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
