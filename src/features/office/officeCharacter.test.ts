import { describe, expect, it } from 'vitest'
import { OFFICE_STYLE_SEED_MAX } from '../../data/validation/officeSeats'
import {
  createStyleSeed,
  FEMALE_HAIR_STYLES,
  MALE_HAIR_STYLES,
  OFFICE_PERSONALITIES,
  resolveOfficeCharacter,
} from './officeCharacter'

const SEEDS = Array.from({ length: 400 }, (_, index) => index * 7919 + 13)

describe('office characters', () => {
  it('derives the same look and personality from the same gender and seed', () => {
    for (const seed of SEEDS.slice(0, 20)) {
      expect(resolveOfficeCharacter('female', seed)).toEqual(resolveOfficeCharacter('female', seed))
      expect(resolveOfficeCharacter('male', seed)).toEqual(resolveOfficeCharacter('male', seed))
    }
  })

  it('keeps hair styles inside the chosen gender and reaches every style and personality', () => {
    const male = new Set<string>()
    const female = new Set<string>()
    const personalities = new Set<string>()
    for (const seed of SEEDS) {
      const man = resolveOfficeCharacter('male', seed)
      const woman = resolveOfficeCharacter('female', seed)
      expect(MALE_HAIR_STYLES).toContain(man.look.hairStyle)
      expect(FEMALE_HAIR_STYLES).toContain(woman.look.hairStyle)
      expect(woman.look.hairAccessory === 'none' || woman.look.gender === 'female').toBe(true)
      expect(man.look.hairAccessory).toBe('none')
      male.add(man.look.hairStyle)
      female.add(woman.look.hairStyle)
      personalities.add(man.personality.id)
    }
    expect([...male].sort()).toEqual([...MALE_HAIR_STYLES].sort())
    expect([...female].sort()).toEqual([...FEMALE_HAIR_STYLES].sort())
    expect(personalities.size).toBe(OFFICE_PERSONALITIES.length)
  })

  it('ties personality traits to the look', () => {
    for (const seed of SEEDS) {
      const character = resolveOfficeCharacter('male', seed)
      if (character.personality.id === 'music') expect(character.look.headphones).toBe(true)
      if (character.personality.id === 'checker') expect(character.look.screen).toBe('report')
    }
  })

  it('gives every personality a label, a description and speech lines', () => {
    for (const personality of OFFICE_PERSONALITIES) {
      expect(personality.label.length).toBeGreaterThan(0)
      expect(personality.description.length).toBeGreaterThan(0)
      expect(personality.lines.length).toBeGreaterThan(0)
    }
  })

  it('creates seeds inside the stored integer range', () => {
    for (let index = 0; index < 50; index += 1) {
      const seed = createStyleSeed()
      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(OFFICE_STYLE_SEED_MAX)
    }
  })
})
