import { execFileSync, spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dataRoot = dirname(fileURLToPath(import.meta.url))
const repositoryRoot = resolve(dataRoot, '../..')
const checker = resolve(repositoryRoot, 'scripts/check-dependency-boundaries.mjs')

describe('dependency boundaries', () => {
  it('keeps production layers within the declared dependency graph', () => {
    expect(() => execFileSync(process.execPath, [checker], { cwd: repositoryRoot })).not.toThrow()
  })

  it('rejects deeply nested domain and presentation violations', () => {
    const fixtureRoot = resolve(repositoryRoot, 'scripts/fixtures/dependency-boundaries')
    const result = spawnSync(process.execPath, [checker, '--root', fixtureRoot], {
      cwd: repositoryRoot,
      encoding: 'utf8',
    })
    const output = `${result.stdout}${result.stderr}`
    expect(result.status).toBe(1)
    expect(output).toContain('domain cannot import data')
    expect(output).toContain('presentation cannot import data adapters or mutations')
  })
})
