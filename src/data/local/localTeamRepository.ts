import { assertRecordExists, PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { RepositoryDeps, TeamRepository } from '../repositories/types'

/** 관리 메모는 파트원 계정에만 남긴다(원격 RLS와 같은 조건). */
export const PROFILE_NOTE_TARGET_MESSAGE = '관리 메모는 파트원에게만 남길 수 있어요.'

export function createLocalTeamRepository(ctx: RepositoryDeps): TeamRepository {
  return {
    async addProfileNote(input) {
      const { profile, data, setData } = ctx
      if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
        throw new UserFacingError(PERMISSION_MESSAGE)
      }
      const target = data.profiles.find((item) => item.id === input.profileId)
      assertRecordExists(target)
      if (target.role !== 'member') {
        throw new UserFacingError(PROFILE_NOTE_TARGET_MESSAGE)
      }
      setData((current) => ({
        ...current,
        profileNotes: [{
          id: makeId('profile-note'),
          profile_id: input.profileId,
          leader_id: profile.id,
          note: input.note,
          created_at: new Date().toISOString(),
        }, ...current.profileNotes],
      }))
    },
  }
}
