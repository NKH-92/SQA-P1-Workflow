/**
 * Fail-closed remote browser E2E runner.
 *
 * Starts local Supabase (or reuses an already-running local stack), applies
 * fixtures with the service role, builds production static assets, serves them
 * with Vite preview, runs Playwright `--project=remote`, then always cleans up.
 *
 * Browser env receives only anon key + test user credentials. Service role never
 * reaches VITE_* browser variables.
 */
import { randomBytes } from 'node:crypto'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { validateReadinessManifest } from './validate-readiness-manifest.mjs'

const root = resolve(import.meta.dirname, '..')
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
const directSupabase = process.env.SUPABASE_BIN === 'supabase'
const supabaseCommand = directSupabase ? 'supabase' : npx
const supabasePrefix = directSupabase ? [] : ['--yes', 'supabase@2.109.1']
const temporaryDirectory = mkdtempSync(resolve(root, '.sqa-remote-e2e-'))
let startedStack = false
let heldMigrations = []

function run(command, args, options = {}) {
  let executable = command
  let executableArgs = args
  if (process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(command)) {
    const quote = (value) => {
      if (value.includes('"')) throw new Error('SQA_REMOTE_E2E_UNSAFE_WINDOWS_ARGUMENT')
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
    throw new Error(`SQA_REMOTE_E2E_COMMAND_FAILED: ${command} ${args.join(' ')} (${result.status})`)
  }
  return result
}

function runSupabase(args, options) {
  return run(supabaseCommand, [...supabasePrefix, ...args], options)
}

function parseEnvironment(output) {
  const values = {}
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(?:"([^"]*)"|(.*))$/)
    if (match) values[match[1]] = match[2] ?? match[3] ?? ''
  }
  for (const required of ['API_URL', 'ANON_KEY', 'SERVICE_ROLE_KEY', 'DB_URL']) {
    if (!values[required]) throw new Error(`SQA_REMOTE_E2E_STATUS_ENV_MISSING: ${required}`)
  }
  return values
}

function readFixtureEnvironment(file) {
  let values
  try {
    values = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    throw new Error('SQA_REMOTE_E2E_FIXTURE_OUTPUT_INVALID')
  }
  const entries = values && typeof values === 'object' && !Array.isArray(values)
    ? Object.entries(values)
    : []
  if (
    entries.length < 20
    || entries.some(([key, value]) => !/^RLS_[A-Z0-9_]+$/.test(key) || typeof value !== 'string' || !value)
  ) {
    throw new Error('SQA_REMOTE_E2E_FIXTURE_OUTPUT_INVALID')
  }
  return values
}

function assertLocalUrl(url) {
  const { hostname } = new URL(url)
  if (!['127.0.0.1', 'localhost'].includes(hostname)) {
    throw new Error(`SQA_REMOTE_E2E_NON_LOCAL_TARGET: ${hostname}`)
  }
}

function holdMigrations(directory) {
  const firstHeld = '20260718073243_finalize_review_workflow_hardening.sql'
  const names = readdirSync(resolve(root, 'supabase/migrations'))
    .filter((name) => /^\d{12,14}_.+\.sql$/.test(name) && name >= firstHeld)
    .sort()
  if (names[0] !== firstHeld) throw new Error(`SQA_REMOTE_E2E_MIGRATION_MISSING: ${firstHeld}`)
  return names.map((name) => {
    const source = resolve(root, 'supabase/migrations', name)
    const destination = join(directory, name)
    renameSync(source, destination)
    return { source, destination }
  })
}

function restoreMigrations(held) {
  for (const { source, destination } of held) {
    if (existsSync(destination) && !existsSync(source)) renameSync(destination, source)
  }
}

try {
  validateReadinessManifest(root)
  runSupabase(['stop', '--no-backup'], { allowFailure: true })
  heldMigrations = holdMigrations(temporaryDirectory)
  runSupabase(['start'])
  startedStack = true
  restoreMigrations(heldMigrations)

  let statusResult = runSupabase(['status', '-o', 'env'], { capture: true })
  let status = parseEnvironment(statusResult.stdout)
  assertLocalUrl(status.API_URL)

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
  const fixtures = readFixtureEnvironment(fixtureOutput)
  rmSync(fixtureOutput, { force: true })

  const uninvitedEmail = `rls-uninvited-${randomBytes(6).toString('hex')}@example.test`
  const uninvitedPassword = `${randomBytes(24).toString('base64url')}aA1!`
  const pendingPasswordNext = `${randomBytes(24).toString('base64url')}aA1!`
  const uninvitedScript = resolve(temporaryDirectory, 'create-uninvited.mjs')
  writeFileSync(uninvitedScript, `
import { createClient } from '@supabase/supabase-js'
const admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const email = process.env.REMOTE_E2E_UNINVITED_EMAIL
const password = process.env.REMOTE_E2E_UNINVITED_PASSWORD
if (!email || !password) throw new Error('SQA_REMOTE_E2E_UNINVITED_CREDENTIALS_REQUIRED')
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 })
const existing = listed.data?.users?.find((user) => user.email === email)
if (!existing) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
}
console.log('SQA_REMOTE_E2E_UNINVITED_READY')
`)
  const uninvitedResult = run(process.execPath, [uninvitedScript], {
    capture: true,
    env: {
      SUPABASE_URL: status.API_URL,
      SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
      REMOTE_E2E_UNINVITED_EMAIL: uninvitedEmail,
      REMOTE_E2E_UNINVITED_PASSWORD: uninvitedPassword,
    },
  })
  process.stdout.write(uninvitedResult.stdout)

  run(npm, ['run', 'build'], {
    env: {
      BUILD_SHA: process.env.GITHUB_SHA ?? 'local-remote-e2e',
      BUILD_REF: 'refs/heads/local-remote-e2e',
      VITE_APP_MODE: 'remote',
      VITE_SUPABASE_URL: status.API_URL,
      VITE_SUPABASE_ANON_KEY: status.ANON_KEY,
    },
  })

  if (!existsSync(resolve(root, 'dist/version.json'))) {
    throw new Error('SQA_REMOTE_E2E_VERSION_JSON_MISSING')
  }

  const remoteEnv = {
    REMOTE_E2E_REQUIRED: '1',
    REMOTE_E2E_USE_BUILT_SERVER: '1',
    REMOTE_E2E_BASE_URL: 'http://127.0.0.1:4174',
    SUPABASE_URL: status.API_URL,
    SUPABASE_ANON_KEY: status.ANON_KEY,
    // Node-side only for R-E2E-07 deactivate/restore. Never set as VITE_*.
    SUPABASE_SERVICE_ROLE_KEY: status.SERVICE_ROLE_KEY,
    REMOTE_E2E_LEADER_EMAIL: fixtures.RLS_LEADER_EMAIL,
    REMOTE_E2E_LEADER_PASSWORD: fixtures.RLS_LEADER_PASSWORD,
    REMOTE_E2E_LEADER_B_EMAIL: fixtures.RLS_LEADER_B_EMAIL,
    REMOTE_E2E_LEADER_B_PASSWORD: fixtures.RLS_LEADER_B_PASSWORD,
    REMOTE_E2E_MEMBER_A_EMAIL: fixtures.RLS_MEMBER_A_EMAIL,
    REMOTE_E2E_MEMBER_A_PASSWORD: fixtures.RLS_MEMBER_A_PASSWORD,
    REMOTE_E2E_MEMBER_B_EMAIL: fixtures.RLS_MEMBER_B_EMAIL,
    REMOTE_E2E_MEMBER_B_PASSWORD: fixtures.RLS_MEMBER_B_PASSWORD,
    REMOTE_E2E_INACTIVE_EMAIL: fixtures.RLS_INACTIVE_MEMBER_EMAIL,
    REMOTE_E2E_INACTIVE_PASSWORD: fixtures.RLS_INACTIVE_MEMBER_PASSWORD,
    // Dedicated active member for mid-session deactivation (not the already-inactive fixture).
    REMOTE_E2E_DEACTIVATE_MEMBER_EMAIL: fixtures.RLS_MEMBER_B_EMAIL,
    REMOTE_E2E_DEACTIVATE_MEMBER_PASSWORD: fixtures.RLS_MEMBER_B_PASSWORD,
    REMOTE_E2E_DEACTIVATE_MEMBER_USER_ID: fixtures.RLS_MEMBER_B_USER_ID,
    REMOTE_E2E_PENDING_PASSWORD_EMAIL: fixtures.RLS_PENDING_PASSWORD_EMAIL,
    REMOTE_E2E_PENDING_PASSWORD_PASSWORD: fixtures.RLS_PENDING_PASSWORD,
    REMOTE_E2E_PENDING_PASSWORD_NEXT: pendingPasswordNext,
    REMOTE_E2E_UNINVITED_EMAIL: uninvitedEmail,
    REMOTE_E2E_UNINVITED_PASSWORD: uninvitedPassword,
    REMOTE_E2E_MEMBER_B_REVIEW_TITLE: 'Member B pending',
    REMOTE_E2E_STATS_REVIEW_REQUEST_ID: fixtures.RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID,
    REMOTE_E2E_HARDENED_OCC_REVIEW_REQUEST_ID: fixtures.RLS_HARDENED_OCC_REVIEW_REQUEST_ID,
    REMOTE_E2E_TEST_PRODUCT_ID: fixtures.RLS_TEST_PRODUCT_ID,
    REMOTE_E2E_OWNED_CHANGE_TASK_ID: fixtures.RLS_OWNED_CHANGE_TASK_ID,
  }

  for (const [key, value] of Object.entries(remoteEnv)) {
    if (!value) throw new Error(`SQA_REMOTE_E2E_FIXTURE_MISSING: ${key}`)
  }

  writeFileSync(
    resolve(temporaryDirectory, 'remote-e2e.env.json'),
    `${JSON.stringify({
      supabaseUrlHost: new URL(status.API_URL).hostname,
      hasServiceRoleInBrowserEnv: false,
      scenarios: 13,
    }, null, 2)}\n`,
  )

  run(npx, ['playwright', 'test', '--project=remote'], { env: remoteEnv })
  console.log('SQA_REMOTE_E2E_OK: 13 remote browser scenarios')
} finally {
  restoreMigrations(heldMigrations)
  if (startedStack) {
    runSupabase(['stop', '--no-backup'], { allowFailure: true })
  }
  rmSync(temporaryDirectory, { recursive: true, force: true })
}
