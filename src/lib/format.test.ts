import { describe, expect, it } from 'vitest'
import { formatDate } from './format'

describe('formatDate', () => {
  it('formats date-only values without shifting the calendar day', () => {
    expect(formatDate('2026-07-10')).toBe('2026. 07. 10.')
  })

  it('returns a placeholder for invalid dates', () => {
    expect(formatDate('2026-99-99')).toBe('-')
    expect(formatDate('not-a-date')).toBe('-')
  })
})
