import { describe, expect, it } from 'vitest'
import { csvCell } from './csv'
import { parseCsvRows } from './csvImport'

describe('csvCell', () => {
  it('escapes quotes and formula prefixes', () => {
    expect(csvCell('hello')).toBe('"hello"')
    expect(csvCell('say "hi"')).toBe('"say ""hi"""')
    expect(csvCell('=1+1')).toBe('"\'=1+1"')
  })

  it('round-trips formula-prefixed values through parseCsvRows', () => {
    const exported = `value\n${csvCell('=1+1')}`
    expect(parseCsvRows(exported)[1][0]).toBe('=1+1')
  })
})
