import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { RepositoryDeps, TeamRepository } from '../repositories/types'

export function createLocalTeamRepository(ctx: RepositoryDeps): TeamRepository {
  return {
    async addProfileNote(input) {
      const { profile, data, setData } = ctx
      if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
        throw new UserFacingError('활성 파트장 권한이 필요합니다.')
      }
      const target = data.profiles.find((item) => item.id === input.profileId)
      assertRecordExists(target)
      if (target.role !== 'member') {
        throw new UserFacingError('파트원에게만 메모를 남길 수 있습니다.')
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
