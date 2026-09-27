import { describe, expect, it } from 'vitest'
import { PIXEL_ICON_PALETTE, PIXEL_ICON_SIZE, PIXEL_ICONS, pixelIconGrid } from './officePixelIcons'
import { skyPeriodForHour, skyStateAt } from './officeSky'

describe('office window sky', () => {
  it('names the time of day the way people say it', () => {
    expect(skyPeriodForHour(5)).toBe('새벽')
    expect(skyPeriodForHour(7.5)).toBe('아침')
    expect(skyPeriodForHour(12)).toBe('낮')
    expect(skyPeriodForHour(15.5)).toBe('오후')
    expect(skyPeriodForHour(18.5)).toBe('저녁')
    expect(skyPeriodForHour(21)).toBe('밤')
    expect(skyPeriodForHour(2)).toBe('밤')
    expect(skyPeriodForHour(24)).toBe('밤')
  })

  it('moves the sun across the window by day and the moon by night', () => {
    const morning = skyStateAt(7)
    const noon = skyStateAt(12.25)
    const evening = skyStateAt(18)
    expect(morning.sun && noon.sun && evening.sun).toBeTruthy()
    // 해는 왼쪽에서 떠 오른쪽으로 지고, 한낮에 가장 높다.
    expect(morning.sun!.x).toBeLessThan(noon.sun!.x)
    expect(noon.sun!.x).toBeLessThan(evening.sun!.x)
    expect(noon.sun!.altitude).toBeGreaterThan(morning.sun!.altitude)
    expect(skyStateAt(22).sun).toBeNull()
    expect(skyStateAt(22).moon).not.toBeNull()
    expect(skyStateAt(12).moon).toBeNull()
  })

  it('changes gradually from minute to minute instead of jumping between phases', () => {
    for (let minute = 0; minute < 24 * 60; minute += 1) {
      const before = skyStateAt(minute / 60)
      const after = skyStateAt((minute + 1) / 60)
      for (const key of ['top', 'horizon'] as const) {
        for (let channel = 0; channel < 3; channel += 1) {
          expect(Math.abs(before[key][channel] - after[key][channel]), `${key} at ${minute}`).toBeLessThan(12)
        }
      }
    }
  })

  it('darkens the office and lights the city only in the evening and at night', () => {
    expect(skyStateAt(12).ambientAlpha).toBe(0)
    expect(skyStateAt(12).stars).toBe(0)
    expect(skyStateAt(12).litRatio).toBeLessThan(0.1)
    expect(skyStateAt(1).ambientAlpha).toBeGreaterThan(0.2)
    expect(skyStateAt(1).stars).toBeGreaterThan(0.9)
    expect(skyStateAt(21).litRatio).toBeGreaterThan(0.4)
    expect(skyStateAt(10).beamAlpha).toBeGreaterThan(0)
    expect(skyStateAt(23).beamAlpha).toBe(0)
  })
})

describe('office pixel icons', () => {
  it('draws every presence icon on a 12×12 grid with known colours', () => {
    for (const [id, map] of Object.entries(PIXEL_ICONS)) {
      expect(map, id).toHaveLength(PIXEL_ICON_SIZE)
      for (const row of map) {
        expect(row, id).toHaveLength(PIXEL_ICON_SIZE)
        for (const key of row) if (key !== '.') expect(PIXEL_ICON_PALETTE[key], `${id} ${key}`).toBeTruthy()
      }
      const grid = pixelIconGrid(id as keyof typeof PIXEL_ICONS)
      expect(grid.pixels.filter(Boolean).length, id).toBeGreaterThan(40)
    }
  })
})
