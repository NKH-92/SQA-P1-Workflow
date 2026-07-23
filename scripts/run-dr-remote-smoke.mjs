import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/

function fail(code, detail = '') {
  throw new Error(`${code}${detail ? `: ${detail}` : ''}`)
}

function requiredEnvironment(name) {
  const value = process.env[name]
  if (!value) fail('SQA_DR_SMOKE_ENV_REQUIRED', name)
  return value
}

export function assertRemoteTargetSafety({
  targetProjectRef,
  productionProjectRef,
  allowedTargetRefs,
  targetUrl,
  confirmDisposableTarget,
}) {
  if (confirmDisposableTarget !== 'true') fail('SQA_DR_CONFIRM_DISPOSABLE_REQUIRED')
  if (!PROJECT_REF_PATTERN.test(targetProjectRef) || !PROJECT_REF_PATTERN.test(productionProjectRef)) {
    fail('SQA_DR_PROJECT_REF_INVALID')
  }
  if (targetProjectRef === productionProjectRef) fail('SQA_DR_TARGET_IS_PRODUCTION')
  const allowed = allowedTargetRefs.split(/[\s,]+/).filter(Boolean)
  if (!allowed.includes(targetProjectRef)) fail('SQA_DR_TARGET_NOT_ALLOWLISTED')
  let parsed
  try {
    parsed = new URL(targetUrl)
  } catch {
    fail('SQA_DR_TARGET_URL_INVALID')
  }
  if (parsed.protocol !== 'https:' || parsed.hostname !== `${targetProjectRef}.supabase.co`
    || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    fail('SQA_DR_TARGET_URL_MISMATCH')
  }
  return allowed
}

async function fetchJson(url, options, code) {
  let response
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) })
  } catch {
    fail(code, 'request failed')
  }
  if (!response.ok) fail(code, `status=${response.status}`)
  try {
    return await response.json()
  } catch {
    fail(code, 'invalid JSON')
  }
}

function readFixtureEnvironment(file) {
  let values
  try {
    values = JSON.parse(readFileSync(file, 'utf8'))
  } catch {
    fail('SQA_DR_FIXTURE_OUTPUT_INVALID')
  }
  const entries = values && typeof values === 'object' && !Array.isArray(values)
    ? Object.entries(values)
    : []
  if (
    entries.length < 20
    || entries.some(([key, value]) => !/^RLS_[A-Z0-9_]+$/.test(key) || typeof value !== 'string' || !value)
  ) {
    fail('SQA_DR_FIXTURE_OUTPUT_INVALID')
  }
  return values
}

function containsSensitiveValue(text, values) {
  return values.some((value) => value.length >= 6 && text.includes(value))
}

function runCommand(command, args, environment, sensitiveValues) {
  const result = spawnSync(command, args, {
    cwd: resolve(import.meta.dirname, '..'),
    encoding: 'utf8',
    env: environment,
    maxBuffer: 64 * 1024 * 1024,
  })
  const combined = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (containsSensitiveValue(combined, sensitiveValues)) fail('SQA_DR_SMOKE_LOG_SECRET_EXPOSURE')
  if (result.error || result.status !== 0) fail('SQA_DR_SMOKE_COMMAND_FAILED', `exit=${result.status ?? 'spawn'}`)
  return result.stdout ?? ''
}

function readRlsResults(path, sensitiveValues) {
  let result
  try {
    const serialized = readFileSync(path, 'utf8')
    if (containsSensitiveValue(serialized, sensitiveValues)) {
      fail('SQA_DR_SMOKE_ARTIFACT_SECRET_EXPOSURE')
    }
    result = JSON.parse(serialized)
  } catch {
    fail('SQA_DR_RLS_RESULTS_INVALID')
  }
  const testResults = Array.isArray(result.testResults) ? result.testResults : []
  const passed = result.success === true
    && Number.isSafeInteger(result.numPassedTests)
    && result.numPassedTests > 0
    && result.numFailedTests === 0
    && result.numPendingTests === 0
    && result.numTodoTests === 0
    && testResults.length > 0
  if (!passed) fail('SQA_DR_RLS_RESULTS_FAILED')
  const passedFiles = testResults
    .filter((entry) => entry.status === 'passed')
    .map((entry) => String(entry.name ?? ''))
  return {
    testFiles: passedFiles.length,
    skippedTests: result.numPendingTests,
    audit: passedFiles.some((name) => name.includes('rls.audit-lifecycle.test')),
    reviewLifecycle: passedFiles.some((name) => name.includes('rls.review')),
    changeTaskAuthorization: passedFiles.some((name) => name.includes('rls.change-applications.test')),
  }
}

function parseArguments(args) {
  const options = {}
  const remaining = [...args]
  while (remaining.length > 0) {
    const key = remaining.shift()
    const value = remaining.shift()
    if (!key?.startsWith('--') || value === undefined) fail('SQA_DR_SMOKE_ARGUMENT_INVALID', String(key))
    options[key.slice(2)] = value
  }
  for (const required of ['target-ref', 'target-disposition', 'output', 'rls-output']) {
    if (!options[required]) fail('SQA_DR_SMOKE_ARGUMENT_REQUIRED', required)
  }
  return options
}

async function run() {
  const options = parseArguments(process.argv.slice(2))
  const targetUrl = requiredEnvironment('DR_TARGET_SUPABASE_URL').replace(/\/$/, '')
  const anonKey = requiredEnvironment('DR_TARGET_ANON_KEY')
  const serviceRoleKey = requiredEnvironment('DR_TARGET_SERVICE_ROLE_KEY')
  const preservedEmail = requiredEnvironment('DR_PRESERVED_USER_EMAIL')
  const preservedPassword = requiredEnvironment('DR_PRESERVED_USER_PASSWORD')
  const preservedUserId = requiredEnvironment('DR_PRESERVED_USER_ID')
  const productionProjectRef = requiredEnvironment('DR_PRODUCTION_PROJECT_REF')
  const allowedTargetRefs = requiredEnvironment('DR_ALLOWED_TARGET_REFS')
  const confirmDisposableTarget = requiredEnvironment('DR_CONFIRM_DISPOSABLE_TARGET')
  const targetProjectRef = options['target-ref']
  assertRemoteTargetSafety({
    targetProjectRef,
    productionProjectRef,
    allowedTargetRefs,
    targetUrl: `${targetUrl}/`,
    confirmDisposableTarget,
  })

  const headers = { apikey: anonKey, 'Content-Type': 'application/json' }
  const settings = await fetchJson(`${targetUrl}/auth/v1/settings`, { headers }, 'SQA_DR_AUTH_SETTINGS_FAILED')
  const authSettings = {
    signupDisabled: settings.disable_signup === true,
    emailProviderEnabled: settings.external?.email === true,
    emailConfirmationRequired: settings.mailer_autoconfirm === false,
    anonymousUsersDisabled: settings.external?.anonymous_users === false,
  }
  if (Object.values(authSettings).some((value) => value !== true)) fail('SQA_DR_AUTH_SETTINGS_DRIFT')

  const login = await fetchJson(
    `${targetUrl}/auth/v1/token?grant_type=password`,
    { headers, method: 'POST', body: JSON.stringify({ email: preservedEmail, password: preservedPassword }) },
    'SQA_DR_PRESERVED_LOGIN_FAILED',
  )
  const preservedUserIdMatches = login.user?.id === preservedUserId
  if (!preservedUserIdMatches) fail('SQA_DR_PRESERVED_USER_ID_MISMATCH')

  const sensitiveValues = [anonKey, serviceRoleKey, preservedEmail, preservedPassword, preservedUserId]
  const fixtureOutput = resolve(
    `${options['rls-output']}.${randomBytes(8).toString('hex')}.fixtures.json`,
  )
  let fixtureEnvironment
  try {
    runCommand(
      process.execPath,
      ['scripts/setup-rls-fixtures.mjs'],
      {
        ...process.env,
        SUPABASE_URL: targetUrl,
        SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
        RLS_FIXTURE_OUTPUT_FILE: fixtureOutput,
        RLS_ALLOW_REMOTE_DISPOSABLE: '1',
        RLS_CONFIRM_DISPOSABLE_TARGET: confirmDisposableTarget,
        RLS_REMOTE_TARGET_REF: targetProjectRef,
        RLS_PRODUCTION_PROJECT_REF: productionProjectRef,
        RLS_ALLOWED_TARGET_REFS: allowedTargetRefs,
      },
      sensitiveValues,
    )
    fixtureEnvironment = readFixtureEnvironment(fixtureOutput)
  } finally {
    rmSync(fixtureOutput, { force: true })
  }
  const rlsOutput = resolve(options['rls-output'])
  runCommand(
    process.execPath,
    [
      'node_modules/vitest/vitest.mjs',
      'run',
      'tests/rls',
      '--reporter=json',
      `--outputFile=${rlsOutput}`,
    ],
    {
      ...process.env,
      ...fixtureEnvironment,
      SUPABASE_URL: targetUrl,
      SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      RLS_REQUIRED: '1',
      RLS_ALLOW_REMOTE_DISPOSABLE: '1',
      RLS_CONFIRM_DISPOSABLE_TARGET: confirmDisposableTarget,
      RLS_REMOTE_TARGET_REF: targetProjectRef,
      RLS_PRODUCTION_PROJECT_REF: productionProjectRef,
      RLS_ALLOWED_TARGET_REFS: allowedTargetRefs,
    },
    [...sensitiveValues, ...Object.values(fixtureEnvironment)],
  )
  const rls = readRlsResults(rlsOutput, [...sensitiveValues, ...Object.values(fixtureEnvironment)])
  if (!rls.audit || !rls.reviewLifecycle || !rls.changeTaskAuthorization) {
    fail('SQA_DR_REQUIRED_RLS_SUITE_MISSING')
  }

  const smokeEvidence = {
    schemaVersion: 1,
    strategy: 'platform_clone',
    targetProjectRef,
    productionProjectRef,
    allowedTargetRefs: allowedTargetRefs.split(/[\s,]+/).filter(Boolean),
    preservedLogin: true,
    preservedUserIdMatches,
    authSettings,
    rls: { passed: true, testFiles: rls.testFiles, skippedTests: rls.skippedTests },
    audit: rls.audit,
    reviewLifecycle: rls.reviewLifecycle,
    changeTaskAuthorization: rls.changeTaskAuthorization,
    secretsExposed: false,
    targetDisposition: options['target-disposition'],
  }
  writeFileSync(resolve(options.output), `${JSON.stringify(smokeEvidence, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600,
  })
  process.stdout.write(`SQA_DR_REMOTE_SMOKE_OK target=${targetProjectRef} tests=${rls.testFiles}\n`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  run().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
