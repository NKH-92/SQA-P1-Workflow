import { canReceiveAssignment } from '../../domain/permissions'
import { assertRecordExists, UserFacingError } from '../../lib/errors'
import type { RepositoryDeps } from '../repositories/types'
import { assertMasterVersion, MASTER_STALE_MESSAGE } from '../validation/masterOcc'

export function assertLocalLeader(profile: RepositoryDeps['profile']) {
  if (profile.role !== 'leader' || profile.is_active === false || profile.must_change_password === true) {
    throw new UserFacingError('활성 파트장 권한이 필요합니다.')
  }
}

/** Local-preview mirror of the `*_if_current` RPCs' fail-closed revision check. */
export function assertLocalMasterCurrent(
  current: { updated_at?: string | null } | undefined,
  expectedUpdatedAt: string | null | undefined,
) {
  const currentRevision = assertMasterVersion(current?.updated_at)
  const expectedRevision = assertMasterVersion(expectedUpdatedAt)
  if (currentRevision !== expectedRevision) {
    throw new UserFacingError(MASTER_STALE_MESSAGE)
  }
}

export function assertLocalAssignmentMembers(data: RepositoryDeps['data'], memberIds: string[]) {
  for (const memberId of new Set(memberIds)) {
    const member = data.profiles.find((item) => item.id === memberId)
    assertRecordExists(member)
    if (!canReceiveAssignment(member)) {
      throw new UserFacingError('활성 상태인 파트원에게만 배정할 수 있습니다.')
    }
  }
}
