import { describe, expect, it } from 'vitest'
import { FEMALE_HAIR_STYLES, MALE_HAIR_STYLES, resolveOfficeCharacter, type OfficeLook } from './officeCharacter'
import {
  allPixelMapsForTest,
  composeSeatedSprite,
  OUTLINE_COLOR,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  type SpritePose,
  type SpriteView,
} from './officeSprites'

const PALETTE_KEYS = new Set(['.', 's', 'S', 'h', 'H', 'L', 't', 'T', 'i', 'I', 'e', 'b', 'm', 'g', 'a', 'A', 'k', 'w', 'y', 'Y', 'c', 'C'])
const POSES: SpritePose[] = ['type', 'mouse', 'sip', 'think', 'stretch', 'nod', 'write', 'phone', 'peer', 'idle']
const VIEWS: SpriteView[] = ['front', 'back']

function lookWithHair(style: string): OfficeLook {
  const gender = (MALE_HAIR_STYLES as readonly string[]).includes(style) ? 'male' : 'female'
  for (let seed = 1; seed < 5000; seed += 1) {
    const character = resolveOfficeCharacter(gender, seed)
    if (character.look.hairStyle === style) {
      return { ...character.look, glasses: 'square', headphones: true, lanyard: true, blush: true }
    }
  }
  throw new Error(`no seed for ${style}`)
}

describe('office sprite maps', () => {
  it('uses 16- or 20-column rows and known color roles only', () => {
    for (const [name, map] of allPixelMapsForTest()) {
      const widths = new Set(map.map((row) => row.length))
      expect(widths.size, name).toBe(1)
      expect([16, 20], name).toContain([...widths][0])
      for (const row of map) {
        for (const key of row) expect(PALETTE_KEYS.has(key), `${name}: ${key}`).toBe(true)
      }
    }
  })

  it('composes every hair style, view and pose inside the grid with an outline margin', () => {
    for (const style of [...MALE_HAIR_STYLES, ...FEMALE_HAIR_STYLES]) {
      const look = lookWithHair(style)
      for (const view of VIEWS) {
        for (const pose of POSES) {
          const grid = composeSeatedSprite(look, { view, pose, frame: 0, expression: 'normal' })
          expect(grid.width).toBe(SPRITE_WIDTH)
          expect(grid.height).toBe(SPRITE_HEIGHT)
          expect(grid.pixels).toContain(OUTLINE_COLOR)
          // 외곽선 안쪽 색은 격자 가장자리에 닿지 않는다(잘린 머리카락·팔이 없다).
          for (let y = 0; y < grid.height; y += 1) {
            for (const x of [0, grid.width - 1]) {
              const color = grid.pixels[y * grid.width + x]
              expect(color === null || color === OUTLINE_COLOR, `${style}/${view}/${pose} x=${x} y=${y}`).toBe(true)
            }
          }
          for (let x = 0; x < grid.width; x += 1) {
            const color = grid.pixels[x]
            expect(color === null || color === OUTLINE_COLOR, `${style}/${view}/${pose} top x=${x}`).toBe(true)
          }
        }
      }
    }
  })

  it('changes pixels between typing frames, blinking and views', () => {
    const look = lookWithHair('bob')
    const frameA = composeSeatedSprite(look, { view: 'front', pose: 'type', frame: 0, expression: 'normal' })
    const frameB = composeSeatedSprite(look, { view: 'front', pose: 'type', frame: 1, expression: 'normal' })
    const blink = composeSeatedSprite(look, { view: 'front', pose: 'type', frame: 0, expression: 'blink' })
    const back = composeSeatedSprite(look, { view: 'back', pose: 'type', frame: 0, expression: 'normal' })
    expect(frameA.pixels).not.toEqual(frameB.pixels)
    expect(frameA.pixels).not.toEqual(blink.pixels)
    expect(frameA.pixels).not.toEqual(back.pixels)
  })
})
