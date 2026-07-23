import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
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

function readFixtureEnvironment(file) {
  let values
  try {
    values = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error('SQA_RLS_FIXTURE_OUTPUT_INVALID')
  }
  const entries = values && typeof values === 'object' && !Array.isArray(values)
    ? Object.entries(values)
    : []
  if (
    entries.length < 20
    || entries.some(([key, value]) => !/^RLS_[A-Z0-9_]+$/.test(key) || typeof value !== 'string' || !value)
  ) {
    throw new Error('SQA_RLS_FIXTURE_OUTPUT_INVALID')
  }
  return values
}

function assertLocalApiUrl(value) {
  let hostname
  try {
    hostname = new URL(value).hostname
  } catch {
    throw new Error('SQA_RLS_GATE_LOCAL_API_URL_INVALID')
  }
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    throw new Error(`SQA_RLS_GATE_NON_LOCAL_API_URL: ${hostname}`)
  }
}

function holdMigrations(directory) {
  // The first held migration purges a Storage bucket and therefore cannot run
  // during `supabase start` before the Storage API is available. Hold it and
  // every later migration, then restore/apply the whole suffix in chronological
  // order after the purge. Holding only the two destructive files would apply
  // the older ACL reset *after* newer migrations and silently revoke every new
  // authenticated RPC grant.
  const firstHeld = '20260718073243_finalize_review_workflow_hardening.sql'
  const names = readdirSync(resolve(root, 'supabase/migrations'))
    .filter((name) => /^\d{12,14}_.+\.sql$/.test(name) && name >= firstHeld)
    .sort()
  if (names[0] !== firstHeld) throw new Error(`SQA_RLS_GATE_MIGRATION_MISSING: ${firstHeld}`)
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
  assertLocalApiUrl(status.API_URL)
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
  runSupabase(['db', 'lint', '--local', '--level', 'error', '--fail-on', 'error'])
  status = parseEnvironment(runSupabase(['status', '-o', 'env'], { capture: true }).stdout)

  const fixtureOutput = resolve(temporaryDirectory, 'rls-fixtures.json')
  const fixtureResult = run(process.execPath, ['scripts/setup-rls-fixtures.mjs'], {
    capture: true,
    env: {
      SUPABASE_URL: status.API_URL,
      SUPABASE_ANON_KEY: status.ANON_KEY,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      RLS_FIXTURE_OUTPUT_FILE: fixtureOutput,
    },
  })
  process.stdout.write(fixtureResult.stdout)
  const fixtureEnvironment = readFixtureEnvironment(fixtureOutput)
  rmSync(fixtureOutput, { force: true })

  const legacyRequesterId = fixtureEnvironment.RLS_MEMBER_A_USER_ID
  if (!legacyRequesterId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(legacyRequesterId)) {
    throw new Error('SQA_RLS_LEGACY_REVIEW_REQUESTER_INVALID')
  }
  const expectedLegacyRollback = 'SQA_RLS_EXPECTED_LEGACY_REVIEW_INPUT_ROLLBACK'
  const legacyReviewSql = resolve(temporaryDirectory, 'legacy-review-input.sql')
  writeFileSync(legacyReviewSql, `
do $verify$
declare
  legacy_request_id uuid := gen_random_uuid();
  affected_rows bigint;
  rejected_detail text;
  rollback_message text;
begin
  begin
    execute 'alter table public.review_requests disable trigger review_request_input_v2_guard';
    insert into public.review_requests (
      id, requester_id, title, description, status
    ) values (
      legacy_request_id,
      '${legacyRequesterId}'::uuid,
      'x',
      'y',
      'pending'
    );
    execute 'alter table public.review_requests enable trigger review_request_input_v2_guard';

    update public.review_requests
       set status = 'approved'
     where id = legacy_request_id;
    get diagnostics affected_rows = row_count;
    if affected_rows <> 1 then
      raise exception 'SQA_RLS_LEGACY_STATUS_UPDATE_BLOCKED';
    end if;

    begin
      update public.review_requests
         set title = 'z'
       where id = legacy_request_id;
      raise exception using
        errcode = 'P0002',
        message = 'SQA_RLS_CHANGED_INVALID_TITLE_ACCEPTED';
    exception
      when sqlstate 'P0001' then
        get stacked diagnostics rejected_detail = pg_exception_detail;
        if rejected_detail is distinct from 'SQA_REVIEW_TITLE_INVALID' then
          raise exception 'SQA_RLS_CHANGED_INVALID_TITLE_WRONG_ERROR: %', rejected_detail;
        end if;
    end;

    raise exception using
      errcode = 'P0002',
      message = '${expectedLegacyRollback}';
  exception
    when sqlstate 'P0002' then
      get stacked diagnostics rollback_message = message_text;
      if rollback_message is distinct from '${expectedLegacyRollback}' then
        raise exception 'SQA_RLS_LEGACY_PROBE_WRONG_ROLLBACK: %', rollback_message;
      end if;
  end;

  if exists (
    select 1 from public.review_requests where id = legacy_request_id
  ) then
    raise exception 'SQA_RLS_LEGACY_PROBE_ROW_NOT_ROLLED_BACK';
  end if;
  if not exists (
    select 1
      from pg_trigger
     where tgrelid = 'public.review_requests'::regclass
       and tgname = 'review_request_input_v2_guard'
       and tgenabled in ('O', 'A')
  ) then
    raise exception 'SQA_RLS_LEGACY_PROBE_TRIGGER_NOT_RESTORED';
  end if;
end
$verify$;
`)
  runSupabase(['db', 'query', '--local', '--file', toRootRelativePath(legacyReviewSql)])

  // Seed the scale fixture before the RLS suite so the EXPLAIN/bounded gate
  // is activated (RLS_SCALE_ENABLED=1) rather than permanently skipped.
  if (!fixtureEnvironment.RLS_LEADER_USER_ID) {
    throw new Error('SQA_RLS_SCALE_LEADER_MISSING')
  }
  run(process.execPath, ['scripts/seed-review-scale-fixture.mjs'], {
    env: {
      SUPABASE_URL: status.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      RLS_SCALE_USER_ID: fixtureEnvironment.RLS_LEADER_USER_ID,
    },
  })

  const testEnvironment = {
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    SUPABASE_DB_URL: status.DB_URL,
    // The scale EXPLAIN gate accepts either name; keep both for psql helpers.
    DATABASE_URL: status.DB_URL,
    RLS_SCALE_ENABLED: '1',
    RLS_SCALE_USER_ID: fixtureEnvironment.RLS_LEADER_USER_ID,
    RLS_SCALE_USER_EMAIL: fixtureEnvironment.RLS_LEADER_EMAIL,
    RLS_SCALE_USER_PASSWORD: fixtureEnvironment.RLS_LEADER_PASSWORD,
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
