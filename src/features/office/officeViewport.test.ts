import { describe, expect, it } from 'vitest'
import { WORLD_CAMERA, WORLD_HEIGHT } from './officeGeometry'
import { SCENE_FOCUS_LEFT, SCENE_FOCUS_RIGHT, SCENE_WIDTH, VIEW_HEIGHT } from './officeScene'
import { computeOfficeViewport, initialOfficeScroll } from './officeViewport'

describe('office viewport', () => {
  it('fills the whole card width on desktop instead of leaving empty sides', () => {
    for (const [width, ratio] of [[956, 1], [956, 2], [1370, 1], [1106, 1.5], [921, 1.25]] as const) {
      const viewport = computeOfficeViewport(width, ratio, 560)
      expect(viewport.scrollable, `${width}@${ratio}`).toBe(false)
      expect(viewport.cssWidth, `${width}@${ratio}`).toBeLessThanOrEqual(width)
      expect(viewport.cssWidth, `${width}@${ratio}`).toBeGreaterThan(width * 0.95)
      // 캔버스는 화면 크기와 1:1이라 브라우저가 한 번 더 늘리지 않는다.
      expect(viewport.canvasWidth).toBe(Math.round(viewport.cssWidth * ratio))
      expect(viewport.smooth).toBe(false)
    }
    const wide = computeOfficeViewport(956, 1, 560)
    expect(wide.cssScale).toBeCloseTo(956 / SCENE_WIDTH, 2)
    expect(wide.cssHeight).toBeCloseTo(VIEW_HEIGHT * wide.cssScale, 0)
  })

  it('keeps an exact integer scale when it nearly fills the card', () => {
    expect(computeOfficeViewport(780, 1, 560)).toMatchObject({ canvasWidth: SCENE_WIDTH * 2, cssScale: 2, cssWidth: SCENE_WIDTH * 2 })
    expect(computeOfficeViewport(800, Number.NaN, 560)).toMatchObject({ canvasWidth: SCENE_WIDTH * 2, cssScale: 2 })
  })

  it('draws at 2x and lets the browser shrink smoothly below 2 device pixels per dot', () => {
    const viewport = computeOfficeViewport(742, 1, 560)
    expect(viewport).toMatchObject({ smooth: true, canvasWidth: SCENE_WIDTH * 2, canvasHeight: VIEW_HEIGHT * 2, scrollable: false })
    expect(viewport.cssWidth).toBe(742)
  })

  it('never grows taller than the allowed height', () => {
    for (const ratio of [1, 1.25, 1.5, 2, 3]) {
      for (const maxHeight of [236, 312, 400, 560]) {
        const viewport = computeOfficeViewport(2000, ratio, maxHeight)
        expect(viewport.cssHeight, `${ratio}/${maxHeight}`).toBeLessThanOrEqual(maxHeight + 0.5)
      }
    }
  })

  it('keeps people readable on phones and lets the scene scroll sideways instead of shrinking', () => {
    const viewport = computeOfficeViewport(340, 3, 236)
    expect(viewport.canvasWidth).toBe(SCENE_WIDTH * 5)
    expect(viewport.cssScale).toBeGreaterThanOrEqual(1.5)
    expect(viewport.scrollable).toBe(true)
    expect(viewport.scrollHint).toBe(true)
    expect(viewport.cssHeight).toBeLessThanOrEqual(236)
  })

  it('starts a scrollable scene with the desks centred', () => {
    const viewport = computeOfficeViewport(340, 3, 236)
    const scroll = initialOfficeScroll(viewport, 340)
    const visibleLeft = scroll / viewport.cssScale
    const visibleRight = (scroll + 340) / viewport.cssScale
    const center = (SCENE_FOCUS_LEFT + SCENE_FOCUS_RIGHT) / 2
    expect(visibleLeft).toBeLessThan(center)
    expect(visibleRight).toBeGreaterThan(center)
    expect(initialOfficeScroll(computeOfficeViewport(1100, 1, 560), 1100)).toBe(0)
  })

  it('fills the height of a tall phone in the full-screen office and scrolls sideways', () => {
    const phone = computeOfficeViewport(412, 2.625, 780, WORLD_CAMERA, true)
    expect(phone.scrollable).toBe(true)
    expect(phone.cssScale).toBeGreaterThan(2.3)
    expect(phone.cssHeight).toBeGreaterThan(WORLD_HEIGHT * 2.3)
    expect(phone.cssHeight).toBeLessThanOrEqual(780 + 0.5)
    // 높이가 모자라면 그만큼만 키운다.
    const short = computeOfficeViewport(412, 2, 480, WORLD_CAMERA, true)
    expect(short.cssHeight).toBeLessThanOrEqual(480 + 0.5)
    // 카드(기존 화면)는 예전처럼 읽히는 최소 크기로 둔다.
    expect(computeOfficeViewport(412, 2.625, 780, WORLD_CAMERA).cssScale).toBeLessThan(1.6)
  })
})
