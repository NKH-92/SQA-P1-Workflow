import { describe, expect, it } from 'vitest'
import { WORLD_BOTTOM, WORLD_LEFT, WORLD_RIGHT, WORLD_TOP } from './officeGeometry'
import { HOTSPOT_TABS } from './officeNavigation'
import { VIGNETTES, vignetteArea } from './officeVignette'
import { SCENE_HOTSPOTS } from './officeScene'

describe('office vignettes', () => {
  it('has one place for every clickable office object', () => {
    for (const hotspot of Object.keys(HOTSPOT_TABS)) expect(VIGNETTES).toHaveProperty(hotspot)
  })

  it('crops inside the office world and stands people inside the crop', () => {
    for (const [place, area] of Object.entries(VIGNETTES)) {
      expect(area.w, place).toBe(88)
      expect(area.h, place).toBe(50)
      expect(area.x, place).toBeGreaterThanOrEqual(WORLD_LEFT)
      expect(area.y, place).toBeGreaterThanOrEqual(WORLD_TOP)
      expect(area.x + area.w, place).toBeLessThanOrEqual(WORLD_RIGHT)
      expect(area.y + area.h, place).toBeLessThanOrEqual(WORLD_BOTTOM)
      for (const spot of area.spots) {
        expect(spot.x, place).toBeGreaterThanOrEqual(area.x)
        expect(spot.x, place).toBeLessThanOrEqual(area.x + area.w)
        expect(spot.y, place).toBeGreaterThan(area.y)
        expect(spot.y, place).toBeLessThanOrEqual(area.y + area.h)
      }
    }
  })

  it('frames the object the place is named after', () => {
    for (const hotspot of SCENE_HOTSPOTS) {
      if (hotspot.id === 'meeting' || hotspot.id === 'menu' || hotspot.id === 'calendar') continue
      const area = VIGNETTES[hotspot.id]
      const overlapsX = hotspot.x < area.x + area.w && hotspot.x + hotspot.w > area.x
      const overlapsY = hotspot.y < area.y + area.h && hotspot.y + hotspot.h > area.y
      expect(overlapsX && overlapsY, hotspot.id).toBe(true)
    }
  })
})

it('keeps every personal desk inside the world and falls back without a seat', () => {
  for (let seat = 1; seat <= 8; seat++) {
    const area = vignetteArea('my-desk', seat)
    expect(area.x).toBeGreaterThanOrEqual(WORLD_LEFT)
    expect(area.y).toBeGreaterThanOrEqual(WORLD_TOP)
    expect(area.x + area.w).toBeLessThanOrEqual(WORLD_RIGHT)
    expect(area.y + area.h).toBeLessThanOrEqual(WORLD_BOTTOM)
  }
  expect(vignetteArea('my-desk', 99)).toBe(VIGNETTES.nameplates)
})
