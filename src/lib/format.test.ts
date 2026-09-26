import { describe, expect, it } from 'vitest'
import { formatClock, formatDate, formatDateTime, formatMonthDay } from './format'

const now = new Date('2026-09-27T03:00:00.000Z')

describe('formatDate', () => {
  it('formats date-only values without shifting the calendar day', () => {
    expect(formatDate('2026-07-10', now)).toBe('7월 10일')
  })

  it('adds the year only when the date is not in the current year', () => {
    expect(formatDate('2025-12-03', now)).toBe('2025년 12월 3일')
    expect(formatDate('2027-01-04', now)).toBe('2027년 1월 4일')
  })

  it('reads timestamps in the business time zone', () => {
    // 2026-07-02 16:30 UTC는 서울 기준 7월 3일 오전 1:30이다.
    expect(formatDate('2026-07-02T16:30:00.000Z', now)).toBe('7월 3일')
  })

  it('returns a placeholder for invalid dates', () => {
    expect(formatDate('2026-99-99', now)).toBe('-')
    expect(formatDate('2026-02-30', now)).toBe('-')
    expect(formatDate('not-a-date', now)).toBe('-')
    expect(formatDate(null, now)).toBe('-')
  })
})

describe('formatDateTime', () => {
  it('writes the full date with a 12-hour clock', () => {
    expect(formatDateTime('2026-07-03T08:00:00.000Z')).toBe('2026년 7월 3일 오후 5:00')
    expect(formatDateTime('2026-07-02T15:05:00.000Z')).toBe('2026년 7월 3일 오전 12:05')
  })

  it('keeps date-only values to the date', () => {
    expect(formatDateTime('2026-07-03')).toBe('2026년 7월 3일')
    expect(formatDateTime('nope')).toBe('-')
  })
})

describe('formatMonthDay / formatClock', () => {
  it('formats month-day and clock labels in the business time zone', () => {
    expect(formatMonthDay('2026-09-25T16:30:00.000Z')).toBe('9월 26일')
    expect(formatMonthDay('2026-09-28')).toBe('9월 28일')
    expect(formatClock('2026-09-26T15:41:00.000Z')).toBe('오전 12:41')
    expect(formatClock('2026-09-26T05:05:00.000Z')).toBe('오후 2:05')
  })

  it('rejects invalid input and date-only clocks', () => {
    expect(formatMonthDay('nope')).toBeNull()
    expect(formatClock('nope')).toBeNull()
    expect(formatClock('2026-09-28')).toBeNull()
  })
})
