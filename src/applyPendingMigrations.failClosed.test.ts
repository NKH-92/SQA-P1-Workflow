import { mkdtempSync, readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs'
import { delimiter, join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

const powershell = process.platform === 'win32' ? 'powershell.exe' : 'pwsh'
const shellAvailable = spawnSync(powershell, ['-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()'], {
  encoding: 'utf8',
}).status === 0
const powershellProcessTimeout = 15_000
const tempDirectories: string[] = []

function createFakeNpx(directory: string) {
  if (process.platform === 'win32') {
    writeFileSync(join(directory, 'npx.cmd'), [
      '@echo off',
      'echo %*>>"%FAKE_NPX_LOG%"',
      'echo %* | findstr /c:" link " >nul && exit /b %FAKE_LINK_EXIT%',
      'echo %* | findstr /c:"db query" >nul || goto push',
      'echo %* | findstr /c:"stage-b-preflight" >nul || exit /b %FAKE_QUERY_EXIT%',
      'echo stage_b_storage_handoff_ok',
      'exit /b 0',
      ':push',
      'echo %* | findstr /c:"db push" >nul && exit /b %FAKE_PUSH_EXIT%',
      'exit /b 0',
      '',
    ].join('\r\n'))
    return
  }

  const executable = join(directory, 'npx')
  writeFileSync(executable, [
    '#!/usr/bin/env bash',
    'echo "$*" >> "$FAKE_NPX_LOG"',
    'if [[ " $* " == *" link "* ]]; then exit "$FAKE_LINK_EXIT"; fi',
    'if [[ "$*" == *"db query"* ]]; then',
    '  if [[ "$*" == *"stage-b-preflight"* ]]; then echo stage_b_storage_handoff_ok; exit 0; fi',
    '  exit "$FAKE_QUERY_EXIT"',
    'fi',
    'if [[ "$*" == *"db push"* ]]; then exit "$FAKE_PUSH_EXIT"; fi',
    'exit 0',
    '',
  ].join('\n'))
  chmodSync(executable, 0o755)
}

function runScript(options: { projectRef?: string; linkExit?: number; pushExit?: number; queryExit?: number }) {
  const directory = mkdtempSync(join(tmpdir(), 'sqa-fake-npx-'))
  tempDirectories.push(directory)
  createFakeNpx(directory)
  const logPath = join(directory, 'calls.log')
  const scriptPath = join(import.meta.dirname, '..', 'scripts', 'apply-pending-migrations.ps1')
  const args = ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath]
  if (options.projectRef) args.push('-ProjectRef', options.projectRef)
  const result = spawnSync(powershell, args, {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${directory}${delimiter}${process.env.PATH ?? ''}`,
      FAKE_NPX_LOG: logPath,
      FAKE_LINK_EXIT: String(options.linkExit ?? 0),
      FAKE_PUSH_EXIT: String(options.pushExit ?? 0),
      FAKE_QUERY_EXIT: String(options.queryExit ?? 0),
    },
  })
  const calls = (() => {
    try { return readFileSync(logPath, 'utf8') } catch { return '' }
  })()
  return { ...result, calls, output: `${result.stdout}\n${result.stderr}` }
}

afterEach(() => {
  for (const directory of tempDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe.skipIf(!shellAvailable)('apply-pending-migrations native failures', () => {
  it('stops immediately when project linking fails', () => {
    const result = runScript({ projectRef: 'abcdefghijklmnop', linkExit: 7 })

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('SQA_SUPABASE_NATIVE_FAILED: link exited with code 7')
    expect(result.calls).toContain('link --project-ref abcdefghijklmnop')
    expect(result.calls).not.toContain('db push')
  }, powershellProcessTimeout)

  it('does not run readiness verification or print success after db push fails', () => {
    const result = runScript({ pushExit: 9 })

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('SQA_SUPABASE_NATIVE_FAILED: db-push exited with code 9')
    expect(result.calls).toContain('db push')
    expect(result.calls).not.toContain('00_migration_history.sql')
    expect(result.output).not.toContain('Verification passed.')
  }, powershellProcessTimeout)

  it('does not print success after the readiness query fails', () => {
    const result = runScript({ queryExit: 11 })

    expect(result.status).not.toBe(0)
    expect(result.output).toContain('SQA_SUPABASE_NATIVE_FAILED: readiness-00_migration_history.sql exited with code 11')
    expect(result.calls).toContain('00_migration_history.sql')
    expect(result.output).not.toContain('Verification passed.')
  }, powershellProcessTimeout)
})
