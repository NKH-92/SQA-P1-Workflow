import { describe, expect, it } from 'vitest'
import { BUSINESS_TIME_ZONE, businessDateKey, businessYear } from './businessTime'

describe('business time contract', () => {
  it('uses the Asia/Seoul new-year boundary independently of the host timezone', () => {
    expect(BUSINESS_TIME_ZONE).toBe('Asia/Seoul')
    expect(businessDateKey(new Date('2026-12-31T14:59:59.999Z'))).toBe('2026-12-31')
    expect(businessYear(new Date('2026-12-31T14:59:59.999Z'))).toBe(2026)
    expect(businessDateKey(new Date('2026-12-31T15:00:00.000Z'))).toBe('2027-01-01')
    expect(businessYear(new Date('2026-12-31T15:00:00.000Z'))).toBe(2027)
  })

  it('keeps KST midnight, morning, leap day, and non-DST dates stable', () => {
    expect(businessDateKey(new Date('2026-01-01T00:00:00+09:00'))).toBe('2026-01-01')
    expect(businessDateKey(new Date('2026-01-01T08:59:59+09:00'))).toBe('2026-01-01')
    expect(businessDateKey(new Date('2026-01-01T09:00:00+09:00'))).toBe('2026-01-01')
    expect(businessDateKey(new Date('2024-02-28T15:00:00Z'))).toBe('2024-02-29')
    expect(businessDateKey(new Date('2026-06-30T15:00:00Z'))).toBe('2026-07-01')
  })
})
