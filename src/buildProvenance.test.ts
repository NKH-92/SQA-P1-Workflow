import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const renderScript = resolve(root, 'scripts/render-build-provenance.mjs')
const verifyScript = resolve(root, 'scripts/verify-build-provenance.mjs')
const temporaryDirectories: string[] = []

function fixtureProject() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'sqa-provenance-'))
  temporaryDirectories.push(projectRoot)
  mkdirSync(join(projectRoot, 'scripts/sql/verify'), { recursive: true })
  writeFileSync(join(projectRoot, 'package-lock.json'), '{"lockfileVersion":3}\n', 'utf8')
  writeFileSync(
    join(projectRoot, 'scripts/sql/verify/manifest.json'),
    '{"schemaVersion":1,"readinessFiles":[],"migrationVersions":[]}\n',
    'utf8',
  )
  return projectRoot
}

function runScript(script: string, cwd: string, env: Record<string, string> = {}, args: string[] = []) {
  return spawnSync(process.execPath, [script, ...args], {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('build provenance scripts', () => {
  it('accepts only lowercase 40-character production SHAs and fails closed when missing', () => {
    for (const invalidSha of ['', 'A'.repeat(40), 'a'.repeat(39), 'g'.repeat(40)]) {
      const projectRoot = fixtureProject()
      const result = runScript(renderScript, projectRoot, {
        BUILD_PROVENANCE_MODE: 'production',
        GITHUB_SHA: invalidSha,
        GITHUB_REF: 'refs/heads/main',
      })
      expect(result.status, result.stderr).toBe(1)
      expect(result.stderr).toMatch(/SHA/)
    }

    const projectRoot = fixtureProject()
    const validSha = 'a'.repeat(40)
    const valid = runScript(renderScript, projectRoot, {
      BUILD_PROVENANCE_MODE: 'production',
      GITHUB_SHA: validSha,
      GITHUB_REF: 'refs/heads/main',
    })
    expect(valid.status, valid.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(projectRoot, 'dist/version.json'), 'utf8'))).toMatchObject({
      schemaVersion: 1,
      sha: validSha,
      ref: 'refs/heads/main',
    })
  })

  it('allows explicit local identity but rejects unknown modes and path traversal', () => {
    const projectRoot = fixtureProject()
    const local = runScript(renderScript, projectRoot, { BUILD_PROVENANCE_MODE: 'local' })
    expect(local.status, local.stderr).toBe(0)
    expect(JSON.parse(readFileSync(join(projectRoot, 'dist/version.json'), 'utf8'))).toMatchObject({
      sha: 'local',
      ref: 'local',
    })

    const unknown = runScript(renderScript, projectRoot, { BUILD_PROVENANCE_MODE: 'preview' })
    expect(unknown.status).toBe(1)
    expect(unknown.stderr).toMatch(/mode/i)

    const traversal = runScript(renderScript, projectRoot, {
      BUILD_PROVENANCE_MODE: 'local',
      BUILD_PROVENANCE_OUTPUT: '../version.json',
    })
    expect(traversal.status).toBe(1)
    expect(traversal.stderr).toMatch(/outside/i)
  })

  it('hashes the lockfile and readiness manifest deterministically without secret-looking keys', () => {
    const projectRoot = fixtureProject()
    const first = runScript(renderScript, projectRoot, { BUILD_PROVENANCE_MODE: 'local' })
    expect(first.status, first.stderr).toBe(0)
    const firstPayload = JSON.parse(readFileSync(join(projectRoot, 'dist/version.json'), 'utf8')) as Record<string, unknown>
    const second = runScript(renderScript, projectRoot, { BUILD_PROVENANCE_MODE: 'local' })
    expect(second.status, second.stderr).toBe(0)
    const secondPayload = JSON.parse(readFileSync(join(projectRoot, 'dist/version.json'), 'utf8')) as Record<string, unknown>

    expect(firstPayload.lockfileSha256).toBe(secondPayload.lockfileSha256)
    expect(firstPayload.readinessManifestSha256).toBe(secondPayload.readinessManifestSha256)
    expect(Object.keys(firstPayload).sort()).toEqual([
      'builtAt',
      'lockfileSha256',
      'readinessManifestSha256',
      'ref',
      'schemaVersion',
      'sha',
    ])
    expect(Object.keys(firstPayload).some((key) => /secret|token|password|url|email|user/i.test(key))).toBe(false)
  })

  it('fails live verification on SHA or source hash mismatch', () => {
    const projectRoot = fixtureProject()
    const sha = 'b'.repeat(40)
    const rendered = runScript(renderScript, projectRoot, {
      BUILD_PROVENANCE_MODE: 'production',
      GITHUB_SHA: sha,
      GITHUB_REF: 'refs/heads/main',
    })
    expect(rendered.status, rendered.stderr).toBe(0)

    const verified = runScript(verifyScript, projectRoot, {
      BUILD_PROVENANCE_EXPECTED_SHA: sha,
      BUILD_PROVENANCE_EXPECTED_REF: 'refs/heads/main',
    }, ['dist/version.json'])
    expect(verified.status, verified.stderr).toBe(0)

    const wrongSha = runScript(verifyScript, projectRoot, {
      BUILD_PROVENANCE_EXPECTED_SHA: 'c'.repeat(40),
      BUILD_PROVENANCE_EXPECTED_REF: 'refs/heads/main',
    }, ['dist/version.json'])
    expect(wrongSha.status).toBe(1)
    expect(wrongSha.stderr).toMatch(/SHA mismatch/)

    writeFileSync(join(projectRoot, 'package-lock.json'), '{"tampered":true}\n', 'utf8')
    const wrongHash = runScript(verifyScript, projectRoot, {
      BUILD_PROVENANCE_EXPECTED_SHA: sha,
      BUILD_PROVENANCE_EXPECTED_REF: 'refs/heads/main',
    }, ['dist/version.json'])
    expect(wrongHash.status).toBe(1)
    expect(wrongHash.stderr).toMatch(/lockfile hash mismatch/)
  })
})
