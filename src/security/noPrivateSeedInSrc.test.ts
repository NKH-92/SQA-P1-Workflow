import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const srcRoot = join(process.cwd(), 'src')

function walk(dir: string): string[] {
  const entries = readdirSync(dir)
  return entries.flatMap((entry: string) => {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) return walk(fullPath)
    return [fullPath]
  })
}

const forbiddenFilenames = ['p1ProductAllocation.ts', 'p1DutyAllocation.ts']
const forbiddenPatterns = [
  /5-ALA/,
  /HL1113/,
  /편승훈/,
  /구하영/,
  /남광현/,
]

describe('noPrivateSeedInSrc', () => {
  it('does not include removed P1 allocation source files', () => {
    for (const filename of forbiddenFilenames) {
      expect(() => readFileSync(join(srcRoot, 'data', filename), 'utf8')).toThrow()
    }
  })

  it('demoData imports only anonymous demo allocation modules', () => {
    const demoData = readFileSync(join(srcRoot, 'demoData.ts'), 'utf8')
    expect(demoData).toContain('./demo/anonymousProductAllocation')
    expect(demoData).toContain('./demo/anonymousDutyAllocation')
    expect(demoData).not.toContain('./data/p1ProductAllocation')
    expect(demoData).not.toContain('./data/p1DutyAllocation')
  })

  it('does not contain known private product or assignee names under src/', () => {
    const sourceFiles = walk(srcRoot).filter(
      (path) => /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path),
    )
    for (const file of sourceFiles) {
      const content = readFileSync(file, 'utf8')
      for (const pattern of forbiddenPatterns) {
        expect(content, file).not.toMatch(pattern)
      }
    }
  })
})
