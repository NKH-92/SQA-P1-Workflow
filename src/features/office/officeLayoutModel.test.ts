import { describe, expect, it } from 'vitest'
import type { OfficeLayout, Profile } from '../../types'
import {
  assignSeat,
  draftsFromLayout,
  rerollSeat,
  sameSeating,
  sceneOccupants,
  seatCandidates,
  seatsToSave,
  setSeatGender,
} from './officeLayoutModel'

const layout: OfficeLayout = {
  revision: 'r1',
  seats: [
    { seat_index: 2, profile_id: 'a', name: '가', gender: 'female', style_seed: 10 },
    { seat_index: 6, profile_id: 'b', name: '나', gender: 'male', style_seed: 20 },
  ],
}

const seedFor = (seatIndex: number) => 1000 + seatIndex

describe('office layout model', () => {
  it('opens all eight seats with the stored people and fresh seeds for empty seats', () => {
    const drafts = draftsFromLayout(layout, seedFor)
    expect(drafts).toHaveLength(8)
    expect(drafts[1]).toMatchObject({ seatIndex: 2, profileId: 'a', gender: 'female', styleSeed: 10 })
    expect(drafts[0]).toMatchObject({ seatIndex: 1, profileId: null, gender: null, styleSeed: 1001 })
  })

  it('moves a seated person with the same character and empties the old seat', () => {
    const moved = assignSeat(draftsFromLayout(layout, seedFor), 1, 'b', 555)
    expect(moved[0]).toMatchObject({ seatIndex: 1, profileId: 'b', gender: 'male', styleSeed: 20, movedFrom: 6 })
    expect(moved[5]).toMatchObject({ seatIndex: 6, profileId: null, gender: null })
  })

  it('asks for a gender when a new person sits down and clears it when the seat empties', () => {
    const seated = assignSeat(draftsFromLayout(layout, seedFor), 3, 'c', 777)
    expect(seated[2]).toMatchObject({ profileId: 'c', gender: null, styleSeed: 777, movedFrom: null })
    expect(seatsToSave(seated).missingGender).toEqual([3])

    const chosen = setSeatGender(seated, 3, 'female')
    expect(seatsToSave(chosen)).toEqual({
      missingGender: [],
      seats: [
        { seat_index: 2, profile_id: 'a', gender: 'female', style_seed: 10 },
        { seat_index: 3, profile_id: 'c', gender: 'female', style_seed: 777 },
        { seat_index: 6, profile_id: 'b', gender: 'male', style_seed: 20 },
      ],
    })

    const emptied = assignSeat(chosen, 3, null, 1)
    expect(emptied[2]).toMatchObject({ profileId: null, gender: null })
  })

  it('changes only the rerolled seat seed', () => {
    const drafts = draftsFromLayout(layout, seedFor)
    const rerolled = rerollSeat(drafts, 2, 99)
    expect(rerolled[1].styleSeed).toBe(99)
    expect(rerolled[5].styleSeed).toBe(20)
    expect(sameSeating(drafts, rerolled)).toBe(false)
  })

  it('ignores temporary seeds of empty seats when checking for changes', () => {
    const first = draftsFromLayout(layout, seedFor)
    const second = draftsFromLayout(layout, (seatIndex) => seatIndex * 3)
    expect(sameSeating(first, second)).toBe(true)
  })

  it('offers active accounts only, leaders first then by name', () => {
    const profiles = [
      { id: 'm2', name: '하늘', role: 'member', email: '' },
      { id: 'm1', name: '가람', role: 'member', email: '' },
      { id: 'x', name: '나래', role: 'member', email: '', is_active: false },
      { id: 't', name: '팀장', role: 'team_leader', email: '' },
      { id: 'l', name: '파트장', role: 'leader', email: '' },
    ] as Profile[]
    expect(seatCandidates(profiles).map((profile) => profile.id)).toEqual(['l', 't', 'm1', 'm2'])
  })

  it('resolves characters for the scene from gender and seed', () => {
    const occupants = sceneOccupants(layout)
    expect(occupants.map((occupant) => occupant.seatIndex)).toEqual([2, 6])
    expect(occupants[0].character.look.gender).toBe('female')
    expect(occupants[1].character.seed).toBe(20)
    expect(sceneOccupants(undefined)).toEqual([])
  })
})
