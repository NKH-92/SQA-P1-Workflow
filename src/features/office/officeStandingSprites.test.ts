import { describe, expect, it } from 'vitest'
import { FEMALE_HAIR_STYLES, MALE_HAIR_STYLES, resolveOfficeCharacter, type OfficeLook } from './officeCharacter'
import { OUTLINE_COLOR } from './officeSprites'
import {
  composeStandingSprite,
  STAND_HEIGHT,
  standingPixelMapsForTest,
  type Facing,
  type HeldItem,
  type StandingPose,
} from './officeStandingSprites'

const PALETTE_KEYS = new Set(['.', 's', 'S', 'h', 'H', 'L', 't', 'T', 'i', 'I', 'p', 'P', 'f', 'e', 'b', 'm', 'g', 'a', 'A', 'k', 'w', 'y', 'Y'])
const FACINGS: Facing[] = ['down', 'up', 'left', 'right']
const POSES: Array<[StandingPose, HeldItem]> = [
  ['walk', 'none'],
  ['walk', 'paper'],
  ['stand', 'cup'],
  ['sip', 'cup'],
  ['reach', 'none'],
  ['talk', 'none'],
]

function lookWithHair(style: string): OfficeLook {
  const gender = (MALE_HAIR_STYLES as readonly string[]).includes(style) ? 'male' : 'female'
  for (let seed = 1; seed < 5000; seed += 1) {
    const character = resolveOfficeCharacter(gender, seed)
    if (character.look.hairStyle === style) {
      return { ...character.look, glasses: 'round', headphones: true, lanyard: true, blush: true }
    }
  }
  throw new Error(`no seed for ${style}`)
}

describe('standing office sprites', () => {
  it('uses 16- or 20-column rows and known color roles only', () => {
    for (const [name, map] of standingPixelMapsForTest()) {
      const widths = new Set(map.map((row) => row.length))
      expect(widths.size, name).toBe(1)
      expect([16, 20], name).toContain([...widths][0])
      for (const row of map) for (const key of row) expect(PALETTE_KEYS.has(key), `${name}: ${key}`).toBe(true)
    }
  })

  it('draws every hair style facing every way inside the grid with an outline margin', () => {
    for (const style of [...MALE_HAIR_STYLES, ...FEMALE_HAIR_STYLES]) {
      const look = lookWithHair(style)
      for (const facing of FACINGS) {
        for (const [pose, held] of POSES) {
          for (const frame of [0, 1, 2, 3]) {
            const grid = composeStandingSprite(look, { facing, pose, frame, held, expression: 'normal' })
            expect(grid.height).toBe(STAND_HEIGHT)
            expect(grid.pixels).toContain(OUTLINE_COLOR)
            for (let y = 0; y < grid.height; y += 1) {
              for (const x of [0, grid.width - 1]) {
                const color = grid.pixels[y * grid.width + x]
                expect(color === null || color === OUTLINE_COLOR, `${style}/${facing}/${pose}/${frame}`).toBe(true)
              }
            }
          }
        }
      }
    }
  })

  it('mirrors the left-facing sprite for the right-facing one', () => {
    const look = lookWithHair('ponytail')
    const left = composeStandingSprite(look, { facing: 'left', pose: 'walk', frame: 1, held: 'none', expression: 'normal' })
    const right = composeStandingSprite(look, { facing: 'right', pose: 'walk', frame: 1, held: 'none', expression: 'normal' })
    for (let y = 0; y < left.height; y += 1) {
      for (let x = 0; x < left.width; x += 1) {
        expect(right.pixels[y * right.width + x]).toBe(left.pixels[y * left.width + (left.width - 1 - x)])
      }
    }
  })

  it('moves the legs between walking frames', () => {
    const look = lookWithHair('neat')
    const standing = composeStandingSprite(look, { facing: 'down', pose: 'walk', frame: 0, held: 'none', expression: 'normal' })
    const stepping = composeStandingSprite(look, { facing: 'down', pose: 'walk', frame: 1, held: 'none', expression: 'normal' })
    expect(stepping.pixels).not.toEqual(standing.pixels)
  })
})
