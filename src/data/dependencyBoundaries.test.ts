import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const dataRoot = dirname(fileURLToPath(import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(path)
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : []
  })
}

describe('data dependency boundaries', () => {
  it('keeps the data layer independent from UI feature modules', () => {
    const offenders = sourceFiles(dataRoot).flatMap((path) => {
      const source = readFileSync(path, 'utf8')
      const imports = [...source.matchAll(/(?:from\s+|import\s*\()['"]([^'"]+)['"]/g)]
      return imports
        .filter((match) => match[1].split(/[\\/]/).includes('features'))
        .map((match) => `${relative(dataRoot, path)} -> ${match[1]}`)
    })

    expect(offenders).toEqual([])
  })
})
