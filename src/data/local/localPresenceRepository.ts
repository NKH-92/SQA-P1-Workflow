import { businessDateKey } from '../../lib/businessTime'
import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import type { MemberPresence } from '../../types'
import type { PresenceRepository, RepositoryDeps } from '../repositories/types'
import {
  canEditPresence,
  hasPresence,
  isMemberStatusKind,
  MEMBER_PRESENCE_FORBIDDEN_MESSAGE,
  MEMBER_PRESENCE_INVALID_MESSAGE,
  MEMBER_PRESENCE_TARGET_MESSAGE,
  validateMemberLeave,
} from '../validation/memberPresence'

let localLeaveSequence = 0

const EMPTY: MemberPresence = { statuses: [], leaves: [] }

/** 미리보기 자리 상태. 원격 RPC와 같은 권한(본인·파트장)과 기간 규칙을 따른다. */
export function createLocalPresenceRepository(ctx: RepositoryDeps): PresenceRepository {
  const targetOf = (profileId: string) => {
    const { profile, data } = ctx
    const target = data.profiles.find((candidate) => candidate.id === profileId)
    if (!canEditPresence(profile, profile)) throw new UserFacingError(PERMISSION_MESSAGE)
    if (!target || !hasPresence(target)) throw new UserFacingError(MEMBER_PRESENCE_TARGET_MESSAGE)
    if (!canEditPresence(profile, target)) throw new UserFacingError(MEMBER_PRESENCE_FORBIDDEN_MESSAGE)
    return target
  }

  return {
    async setStatus(profileId, status) {
      const target = targetOf(profileId)
      if (status !== null && !isMemberStatusKind(status)) throw new UserFacingError(MEMBER_PRESENCE_INVALID_MESSAGE)
      const updatedAt = new Date().toISOString()
      ctx.setData((current) => {
        const presence = current.memberPresence ?? EMPTY
        const statuses = presence.statuses.filter((item) => item.profile_id !== profileId)
        if (status) statuses.push({ profile_id: profileId, name: target.name, status, updated_at: updatedAt })
        return { ...current, memberPresence: { ...presence, statuses } }
      })
    },

    async addLeave(input) {
      const target = targetOf(input.profileId)
      const leave = validateMemberLeave(input, ctx.data.memberPresence)
      localLeaveSequence += 1
      const today = businessDateKey(new Date())
      ctx.setData((current) => {
        const presence = current.memberPresence ?? EMPTY
        return {
          ...current,
          memberPresence: {
            ...presence,
            leaves: [
              ...presence.leaves.filter((item) => item.ends_on >= today),
              {
                id: `preview-leave-${Date.now()}-${localLeaveSequence}`,
                profile_id: leave.profileId,
                name: target.name,
                kind: leave.kind,
                starts_on: leave.startsOn,
                ends_on: leave.endsOn,
                note: leave.note,
              },
            ].sort((left, right) => left.starts_on.localeCompare(right.starts_on)),
          },
        }
      })
    },

    async deleteLeave(leaveId) {
      const leave = ctx.data.memberPresence?.leaves.find((item) => item.id === leaveId)
      if (!leave) return { removed: false }
      targetOf(leave.profile_id)
      ctx.setData((current) => {
        const presence = current.memberPresence ?? EMPTY
        return { ...current, memberPresence: { ...presence, leaves: presence.leaves.filter((item) => item.id !== leaveId) } }
      })
      return { removed: true }
    },
  }
}
