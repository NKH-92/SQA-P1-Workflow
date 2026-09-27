import { describe, expect, it } from 'vitest'
import {
  localOfficeRevision,
  OFFICE_SEAT_DUPLICATE_MESSAGE,
  OFFICE_SEAT_INACTIVE_MESSAGE,
  OFFICE_SEATS_INVALID_MESSAGE,
  parseOfficeLayout,
  validateOfficeSeats,
  type OfficeSeatInput,
} from './officeSeats'

const A = '11111111-1111-4111-8111-111111111111'
const B = '22222222-2222-4222-8222-222222222222'
const profiles = [
  { id: A, is_active: true },
  { id: B, is_active: true },
  { id: 'inactive', is_active: false },
  { id: 'preview-id' },
]

function seat(overrides: Partial<OfficeSeatInput> = {}): OfficeSeatInput {
  return { seat_index: 1, profile_id: A, gender: 'female', style_seed: 5, ...overrides }
}

describe('office seat validation', () => {
  it('accepts up to eight distinct active people', () => {
    expect(() => validateOfficeSeats([seat(), seat({ seat_index: 8, profile_id: B, gender: 'male' })], profiles)).not.toThrow()
    expect(() => validateOfficeSeats([], profiles)).not.toThrow()
  })

  it('rejects a person or a seat used twice', () => {
    expect(() => validateOfficeSeats([seat(), seat({ seat_index: 2 })], profiles)).toThrow(OFFICE_SEAT_DUPLICATE_MESSAGE)
    expect(() => validateOfficeSeats([seat(), seat({ profile_id: B })], profiles)).toThrow(OFFICE_SEAT_DUPLICATE_MESSAGE)
  })

  it('rejects inactive or unknown accounts', () => {
    expect(() => validateOfficeSeats([seat({ profile_id: 'inactive' })], profiles)).toThrow(OFFICE_SEAT_INACTIVE_MESSAGE)
    expect(() => validateOfficeSeats([seat({ profile_id: 'nobody' })], profiles)).toThrow(OFFICE_SEAT_INACTIVE_MESSAGE)
  })

  it('rejects malformed seats, genders, seeds and too many seats', () => {
    for (const bad of [
      seat({ seat_index: 0 }),
      seat({ seat_index: 9 }),
      seat({ seat_index: 1.5 }),
      seat({ gender: 'other' as never }),
      seat({ style_seed: -1 }),
      seat({ style_seed: 0x80000000 }),
    ]) {
      expect(() => validateOfficeSeats([bad], profiles)).toThrow(OFFICE_SEATS_INVALID_MESSAGE)
    }
    const nine = Array.from({ length: 9 }, (_, index) => seat({ seat_index: index + 1 }))
    expect(() => validateOfficeSeats(nine, profiles)).toThrow(OFFICE_SEATS_INVALID_MESSAGE)
  })

  it('requires UUID profile ids only for the remote adapter', () => {
    expect(() => validateOfficeSeats([seat({ profile_id: 'preview-id' })], profiles)).not.toThrow()
    expect(() => validateOfficeSeats([seat({ profile_id: 'preview-id' })], profiles, { requireUuid: true })).toThrow(
      OFFICE_SEATS_INVALID_MESSAGE,
    )
  })
})

describe('office layout parsing', () => {
  it('reads the RPC envelope and sorts seats', () => {
    expect(parseOfficeLayout({
      revision: 'abc',
      seats: [
        { seat_index: 5, profile_id: B, name: '나', gender: 'male', style_seed: 2 },
        { seat_index: 1, profile_id: A, name: '가', gender: 'female', style_seed: 1 },
      ],
    })).toEqual({
      revision: 'abc',
      seats: [
        { seat_index: 1, profile_id: A, name: '가', gender: 'female', style_seed: 1 },
        { seat_index: 5, profile_id: B, name: '나', gender: 'male', style_seed: 2 },
      ],
    })
  })

  it('keeps a known role and ignores an unknown one', () => {
    const parsed = parseOfficeLayout({
      revision: 'r',
      seats: [
        { seat_index: 1, profile_id: A, name: '가', role: 'team_leader', gender: 'female', style_seed: 1 },
        { seat_index: 2, profile_id: B, name: '나', role: 'admin', gender: 'male', style_seed: 2 },
      ],
    })
    expect(parsed?.seats[0].role).toBe('team_leader')
    expect(parsed?.seats[1]).not.toHaveProperty('role')
  })

  it('treats a malformed envelope as a failed load', () => {
    for (const value of [null, [], {}, { revision: 1, seats: [] }, { revision: 'a', seats: {} }]) {
      expect(parseOfficeLayout(value)).toBeNull()
    }
  })

  it('drops only the malformed or duplicated seats', () => {
    const parsed = parseOfficeLayout({
      revision: 'r',
      seats: [
        { seat_index: 1, profile_id: A, name: '가', gender: 'female', style_seed: 1 },
        { seat_index: 1, profile_id: B, name: '중복', gender: 'male', style_seed: 1 },
        { seat_index: 12, profile_id: B, name: '범위', gender: 'male', style_seed: 1 },
        { seat_index: 3, profile_id: B, name: '성별', gender: 'x', style_seed: 1 },
        'broken',
      ],
    })
    expect(parsed?.seats.map((item) => item.name)).toEqual(['가'])
  })

  it('builds the same local revision regardless of order', () => {
    const one = seat()
    const two = seat({ seat_index: 3, profile_id: B, gender: 'male' })
    expect(localOfficeRevision([one, two])).toBe(localOfficeRevision([two, one]))
    expect(localOfficeRevision([one])).not.toBe(localOfficeRevision([one, two]))
  })
})
