import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const styles = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

describe('feedback typography', () => {
  it('preserves line breaks in registered feedback', () => {
    const feedbackParagraph = styles.match(/\.feedback p\s*\{([^}]*)\}/)?.[1]

    expect(feedbackParagraph).toMatch(/white-space:\s*pre-wrap\s*;/)
  })
})
