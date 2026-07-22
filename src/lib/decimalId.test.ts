import { describe, expect, it } from 'vitest'
import { compareDecimalIds, maxDecimalId } from './decimalId'

describe('decimal bigint identifiers', () => {
  it('orders adjacent ids above Number.MAX_SAFE_INTEGER without numeric coercion', () => {
    expect(compareDecimalIds('9007199254740992', '9007199254740991')).toBeGreaterThan(0)
    expect(compareDecimalIds('9007199254740993', '9007199254740992')).toBeGreaterThan(0)
    expect(maxDecimalId('9007199254740992', '9007199254740993')).toBe('9007199254740993')
  })

  it('supports existing small numeric preview fixtures', () => {
    expect(compareDecimalIds(12, 9)).toBeGreaterThan(0)
    expect(maxDecimalId(null, 7)).toBe('7')
  })
})
