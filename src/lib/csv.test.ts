import { describe, expect, it } from 'vitest'
import { csvCell } from './csv'

describe('csvCell', () => {
  it('escapes quotes and formula prefixes', () => {
    expect(csvCell('hello')).toBe('"hello"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=1+1')).toBe('"\'=1+1"')
  })
})
