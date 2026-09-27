import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import type { OfficeSeat } from '../../types'
import type { OfficeRepository, RepositoryDeps } from '../repositories/types'
import {
  localOfficeRevision,
  OFFICE_LAYOUT_STALE_MESSAGE,
  validateOfficeSeats,
} from '../validation/officeSeats'

/** 미리보기 사무실 자리 배치. 원격 replace_office_seats와 같은 권한·검증·동시 수정 규칙을 따른다. */
export function createLocalOfficeRepository(ctx: RepositoryDeps): OfficeRepository {
  return {
    async replaceOfficeSeats({ seats, expectedRevision }) {
      const { profile, data, setData } = ctx
      if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
        throw new UserFacingError(PERMISSION_MESSAGE)
      }
      validateOfficeSeats(seats, data.profiles)
      const current = data.officeLayout ?? { revision: null, seats: [] }
      if (expectedRevision !== current.revision) throw new UserFacingError(OFFICE_LAYOUT_STALE_MESSAGE)

      const revision = localOfficeRevision(seats)
      const currentKey = localOfficeRevision(current.seats)
      if (revision === currentKey) return { changed: false }

      const nextSeats: OfficeSeat[] = [...seats]
        .sort((left, right) => left.seat_index - right.seat_index)
        .map((seat) => ({
          ...seat,
          name: data.profiles.find((item) => item.id === seat.profile_id)?.name ?? '',
        }))
      setData((currentData) => ({ ...currentData, officeLayout: { revision, seats: nextSeats } }))
      return { changed: true }
    },
  }
}
