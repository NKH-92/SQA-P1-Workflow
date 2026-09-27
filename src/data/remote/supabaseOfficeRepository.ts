import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { OfficeRepository, RepositoryDeps } from '../repositories/types'
import {
  OFFICE_LAYOUT_STALE_MESSAGE,
  OFFICE_SEAT_DUPLICATE_MESSAGE,
  OFFICE_SEAT_INACTIVE_MESSAGE,
  OFFICE_SEATS_INVALID_MESSAGE,
  validateOfficeSeats,
} from '../validation/officeSeats'

/** replace_office_seats의 detail 코드를 사용자 문구로 바꾼다. 모르는 오류는 그대로 둔다. */
export function translateOfficeSeatsError<T extends { message?: string; details?: string }>(error: T): T | UserFacingError {
  const text = `${error.message ?? ''} ${error.details ?? ''}`
  if (text.includes('SQA_OFFICE_LAYOUT_CONFLICT')) return new UserFacingError(OFFICE_LAYOUT_STALE_MESSAGE)
  if (text.includes('SQA_OFFICE_SEATS_DUPLICATE')) return new UserFacingError(OFFICE_SEAT_DUPLICATE_MESSAGE)
  if (text.includes('SQA_OFFICE_SEAT_PROFILE_INACTIVE')) return new UserFacingError(OFFICE_SEAT_INACTIVE_MESSAGE)
  if (text.includes('SQA_OFFICE_SEATS_INVALID')) return new UserFacingError(OFFICE_SEATS_INVALID_MESSAGE)
  if (text.includes('SQA_ACTIVE_LEADER_REQUIRED') || text.includes('SQA_TEAM_LEADER_READ_ONLY')) {
    return new UserFacingError(PERMISSION_MESSAGE)
  }
  return error
}

export function createSupabaseOfficeRepository(ctx: RepositoryDeps): OfficeRepository {
  return {
    async replaceOfficeSeats({ seats, expectedRevision }) {
      validateOfficeSeats(seats, ctx.data.profiles, { requireUuid: true })
      const { data, error } = await supabase!.rpc('replace_office_seats', {
        p_seats: seats.map(({ seat_index, profile_id, gender, style_seed }) => ({ seat_index, profile_id, gender, style_seed })),
        p_expected_revision: expectedRevision,
      })
      if (error) throw translateOfficeSeatsError(error)
      return { changed: data === true }
    },
  }
}
