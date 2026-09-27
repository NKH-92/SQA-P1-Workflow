import { UserFacingError } from '../../lib/errors'
import type { OfficeGender, OfficeLayout, OfficeSeat, Profile } from '../../types'

/** 홈 사무실 책상 수(창가 쪽 4 + 통로 쪽 4). 서버 office_seats_seat_index_check와 같다. */
export const OFFICE_SEAT_COUNT = 8
/** 스타일 시드 상한(서버 integer 범위). */
export const OFFICE_STYLE_SEED_MAX = 0x7fffffff

/** replace_office_seats에 보내는 자리 한 칸. 빈자리는 보내지 않는다. */
export type OfficeSeatInput = {
  seat_index: number
  profile_id: string
  gender: OfficeGender
  style_seed: number
}

export const OFFICE_LAYOUT_STALE_MESSAGE = '그사이 자리 배치가 바뀌었어요. 새로 불러온 배치를 확인하고 다시 저장해 주세요.'
export const OFFICE_SEATS_INVALID_MESSAGE = '자리 배치를 저장하지 못했어요. 자리와 캐릭터를 다시 확인해 주세요.'
export const OFFICE_SEAT_DUPLICATE_MESSAGE = '한 사람은 한 자리에만 앉을 수 있어요. 겹친 자리를 다시 골라 주세요.'
export const OFFICE_SEAT_INACTIVE_MESSAGE = '비활성 계정은 자리에 앉힐 수 없어요. 다른 사람을 골라 주세요.'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isOfficeGender(value: unknown): value is OfficeGender {
  return value === 'male' || value === 'female'
}

export function isOfficeStyleSeed(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= OFFICE_STYLE_SEED_MAX
}

function isSeatIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= OFFICE_SEAT_COUNT
}

/**
 * 저장 전에 서버와 같은 조건을 확인한다(자리 1~8, 사람·자리 중복 없음, 활성 계정, 성별·시드 형식).
 * requireUuid는 원격 저장처럼 프로필 id가 UUID여야 할 때만 켠다(미리보기 데이터 id는 UUID가 아니다).
 */
export function validateOfficeSeats(
  seats: readonly OfficeSeatInput[],
  profiles: readonly Pick<Profile, 'id' | 'is_active'>[],
  options: { requireUuid?: boolean } = {},
): void {
  if (seats.length > OFFICE_SEAT_COUNT) throw new UserFacingError(OFFICE_SEATS_INVALID_MESSAGE)
  const seatIndexes = new Set<number>()
  const profileIds = new Set<string>()
  for (const seat of seats) {
    if (
      !isSeatIndex(seat.seat_index)
      || !isOfficeGender(seat.gender)
      || !isOfficeStyleSeed(seat.style_seed)
      || typeof seat.profile_id !== 'string'
      || (options.requireUuid && !UUID_PATTERN.test(seat.profile_id))
    ) {
      throw new UserFacingError(OFFICE_SEATS_INVALID_MESSAGE)
    }
    if (seatIndexes.has(seat.seat_index) || profileIds.has(seat.profile_id)) {
      throw new UserFacingError(OFFICE_SEAT_DUPLICATE_MESSAGE)
    }
    seatIndexes.add(seat.seat_index)
    profileIds.add(seat.profile_id)
    const profile = profiles.find((item) => item.id === seat.profile_id)
    if (!profile || profile.is_active === false) throw new UserFacingError(OFFICE_SEAT_INACTIVE_MESSAGE)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * get_office_seats 응답을 확인한다. 봉투 모양이 다르면 null(불러오기 실패로 다룬다)이고,
 * 자리 하나만 이상하면 그 자리만 뺀다.
 */
export function parseOfficeLayout(value: unknown): OfficeLayout | null {
  if (!isRecord(value) || typeof value.revision !== 'string' || !Array.isArray(value.seats)) return null
  const seats: OfficeSeat[] = []
  const seen = new Set<number>()
  for (const item of value.seats) {
    if (!isRecord(item)) continue
    const { seat_index: seatIndex, profile_id: profileId, name, gender, style_seed: styleSeed, role } = item
    if (
      !isSeatIndex(seatIndex)
      || seen.has(seatIndex)
      || typeof profileId !== 'string'
      || typeof name !== 'string'
      || !isOfficeGender(gender)
      || !isOfficeStyleSeed(styleSeed)
    ) {
      continue
    }
    seen.add(seatIndex)
    const seat: OfficeSeat = { seat_index: seatIndex, profile_id: profileId, name, gender, style_seed: styleSeed }
    if (role === 'leader' || role === 'member' || role === 'team_leader') seat.role = role
    seats.push(seat)
  }
  seats.sort((left, right) => left.seat_index - right.seat_index)
  return { revision: value.revision, seats }
}

/** 미리보기(로컬) 저장소의 revision. 배치 내용이 같으면 같은 값이다. */
export function localOfficeRevision(seats: readonly OfficeSeatInput[]): string {
  const key = [...seats]
    .sort((left, right) => left.seat_index - right.seat_index)
    .map((seat) => `${seat.seat_index}:${seat.profile_id}:${seat.gender}:${seat.style_seed}`)
    .join('|')
  return `local:${key}`
}
