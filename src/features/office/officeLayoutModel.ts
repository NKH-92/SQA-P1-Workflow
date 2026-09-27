import type { OfficeSeatInput } from '../../data/validation/officeSeats'
import { OFFICE_SEAT_COUNT } from '../../data/validation/officeSeats'
import type { OfficeGender, OfficeLayout, Profile, Role } from '../../types'
import { resolveOfficeCharacter, type OfficeCharacter } from './officeCharacter'

/** 자리 배치 창에서 고치는 자리 한 칸. 빈자리는 profileId가 null이다. */
export type SeatDraft = {
  seatIndex: number
  profileId: string | null
  gender: OfficeGender | null
  styleSeed: number
  /** 다른 자리에서 옮겨 온 사람이면 원래 자리 번호(안내 문구용) */
  movedFrom: number | null
}

export type SceneOccupant = {
  seatIndex: number
  profileId: string
  name: string
  /** 모르면(예전 응답) 비어 있다 */
  role?: Role
  character: OfficeCharacter
}

export const WINDOW_ROW_SEATS = [1, 2, 3, 4] as const
export const AISLE_ROW_SEATS = [5, 6, 7, 8] as const

export function seatRowLabel(seatIndex: number) {
  return seatIndex <= 4 ? '창가 쪽 줄' : '통로 쪽 줄'
}

export function emptyOfficeLayout(): OfficeLayout {
  return { revision: null, seats: [] }
}

/** 화면에 그릴 사람들. 성별과 시드로 캐릭터를 만든다. */
export function sceneOccupants(layout: OfficeLayout | undefined): SceneOccupant[] {
  return (layout?.seats ?? []).map((seat) => ({
    seatIndex: seat.seat_index,
    profileId: seat.profile_id,
    name: seat.name,
    ...(seat.role ? { role: seat.role } : {}),
    character: resolveOfficeCharacter(seat.gender, seat.style_seed),
  }))
}

export function draftsFromLayout(layout: OfficeLayout | undefined, seedFor: (seatIndex: number) => number): SeatDraft[] {
  const bySeat = new Map((layout?.seats ?? []).map((seat) => [seat.seat_index, seat]))
  return Array.from({ length: OFFICE_SEAT_COUNT }, (_, index) => {
    const seatIndex = index + 1
    const seat = bySeat.get(seatIndex)
    return seat
      ? { seatIndex, profileId: seat.profile_id, gender: seat.gender, styleSeed: seat.style_seed, movedFrom: null }
      : { seatIndex, profileId: null, gender: null, styleSeed: seedFor(seatIndex), movedFrom: null }
  })
}

/**
 * 자리에 사람을 앉힌다. 이미 다른 자리에 있던 사람이면 캐릭터(성별·시드)를 그대로 들고 옮기고,
 * 원래 자리는 빈자리가 된다. 처음 앉는 사람은 성별을 비워 두어 파트장이 고르게 한다.
 */
export function assignSeat(
  drafts: readonly SeatDraft[],
  seatIndex: number,
  profileId: string | null,
  freshSeed: number,
): SeatDraft[] {
  const target = drafts.find((draft) => draft.seatIndex === seatIndex)
  if (!target || target.profileId === profileId) return [...drafts]
  const previous = profileId ? drafts.find((draft) => draft.profileId === profileId && draft.seatIndex !== seatIndex) : undefined
  return drafts.map((draft) => {
    if (draft.seatIndex === seatIndex) {
      if (!profileId) return { ...draft, profileId: null, gender: null, movedFrom: null }
      if (previous) {
        return { ...draft, profileId, gender: previous.gender, styleSeed: previous.styleSeed, movedFrom: previous.seatIndex }
      }
      return { ...draft, profileId, gender: null, styleSeed: freshSeed, movedFrom: null }
    }
    if (previous && draft.seatIndex === previous.seatIndex) {
      return { ...draft, profileId: null, gender: null, styleSeed: freshSeed, movedFrom: null }
    }
    return draft
  })
}

export function setSeatGender(drafts: readonly SeatDraft[], seatIndex: number, gender: OfficeGender): SeatDraft[] {
  return drafts.map((draft) => (draft.seatIndex === seatIndex ? { ...draft, gender } : draft))
}

export function rerollSeat(drafts: readonly SeatDraft[], seatIndex: number, styleSeed: number): SeatDraft[] {
  return drafts.map((draft) => (draft.seatIndex === seatIndex ? { ...draft, styleSeed } : draft))
}

/** 저장할 자리 목록과, 사람은 있는데 성별을 아직 고르지 않은 자리 번호 */
export function seatsToSave(drafts: readonly SeatDraft[]): { seats: OfficeSeatInput[]; missingGender: number[] } {
  const seats: OfficeSeatInput[] = []
  const missingGender: number[] = []
  for (const draft of drafts) {
    if (!draft.profileId) continue
    if (!draft.gender) {
      missingGender.push(draft.seatIndex)
      continue
    }
    seats.push({ seat_index: draft.seatIndex, profile_id: draft.profileId, gender: draft.gender, style_seed: draft.styleSeed })
  }
  return { seats, missingGender }
}

/** 빈자리의 임시 시드는 비교에서 뺀다(열 때마다 새로 뽑으므로). */
export function sameSeating(left: readonly SeatDraft[], right: readonly SeatDraft[]) {
  const key = (drafts: readonly SeatDraft[]) =>
    drafts
      .filter((draft) => draft.profileId)
      .map((draft) => `${draft.seatIndex}:${draft.profileId}:${draft.gender ?? '-'}:${draft.styleSeed}`)
      .join('|')
  return key(left) === key(right)
}

/** 자리에 앉힐 수 있는 사람(활성 계정). 파트장 → 팀장 → 파트원, 이름순. */
export function seatCandidates(profiles: readonly Profile[]): Profile[] {
  const order = { leader: 0, team_leader: 1, member: 2 } as const
  return profiles
    .filter((profile) => profile.is_active !== false)
    .sort((left, right) => order[left.role] - order[right.role] || left.name.localeCompare(right.name, 'ko'))
}
