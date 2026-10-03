import { describe, expect, it } from 'vitest'
import { MENU_MAX_BYTES, menuWeek, menuWeekLabel, validateMenuFile } from './weeklyMenu'

describe('weekly menu', () => {
  it('changes week at Monday midnight in Seoul, including year boundaries', () => {
    expect(menuWeek(new Date('2026-10-04T14:59:59Z'))).toBe('2026-09-28')
    expect(menuWeek(new Date('2026-10-04T15:00:00Z'))).toBe('2026-10-05')
    expect(menuWeek(new Date('2026-01-01T00:00:00Z'))).toBe('2025-12-29')
    expect(menuWeekLabel('2025-12-29')).toBe('2025.12.29 ~ 01.04')
  })
  it('accepts screenshots and rejects unsupported, empty or oversized files', () => {
    for (const type of ['image/png', 'image/jpeg', 'image/webp']) {
      expect(() => validateMenuFile(new File(['image'], 'capture', { type }))).not.toThrow()
    }
    expect(() => validateMenuFile(new File(['<svg/>'], 'menu.svg', { type: 'image/svg+xml' }))).toThrow('PNG')
    expect(() => validateMenuFile(new File([], 'menu.png', { type: 'image/png' }))).toThrow('10MB')
    expect(() => validateMenuFile(new File([new Uint8Array(MENU_MAX_BYTES + 1)], 'menu.png', { type: 'image/png' }))).toThrow('10MB')
  })
})
