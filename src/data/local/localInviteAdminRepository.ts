import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { InviteAdminRepository, RepositoryDeps } from '../repositories/types'
import { normalizeMasterReason } from '../validation/masterOcc'
import { removeAllowedUser } from './appDataReducers'
import { assertLocalLeader, assertLocalMasterCurrent } from './localAdminGuards'

export function createLocalInviteAdminRepository(deps: RepositoryDeps): InviteAdminRepository {
  const { profile, data, setData } = deps

  return {
    async importInvites(invites) {
      assertLocalLeader(profile)
      setData((current) => ({
        ...current,
        allowedUsers: [
          ...invites.map((invite) => ({
            id: makeId('allowed'),
            ...invite,
            created_at: new Date().toISOString(),
          })),
          ...current.allowedUsers,
        ],
        profiles: [
          ...invites.map((invite) => ({
            id: makeId('profile'),
            ...invite,
          })),
          ...current.profiles,
        ],
      }))
    },

    async addAllowedUser(input) {
      assertLocalLeader(profile)
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        allowedUsers: [{ id: makeId('allowed'), ...input, created_at: now, updated_at: now }, ...current.allowedUsers],
        profiles: [{ id: makeId('profile'), ...input, created_at: now, updated_at: now }, ...current.profiles],
      }))
    },

    async updateInvite(inviteId, payload) {
      assertLocalLeader(profile)
      const current = data.allowedUsers.find((item) => item.id === inviteId)
      assertRecordExists(current)
      const linkedProfile = data.profiles.find(
        (item) => item.email.toLowerCase() === current.email.toLowerCase(),
      )
      normalizeMasterReason(payload.reason)
      assertLocalMasterCurrent(current, payload.expectedUpdatedAt)
      const changed =
        current.email !== payload.email
        || current.name !== payload.name
        || current.role !== payload.role
        || (linkedProfile != null && linkedProfile.role !== payload.role)
      if (!changed) return { noop: true }
      const now = new Date().toISOString()
      setData((currentState) => ({
        ...currentState,
        allowedUsers: currentState.allowedUsers.map((item) =>
          item.id === inviteId
            ? { ...item, email: payload.email, name: payload.name, role: payload.role, updated_at: now }
            : item,
        ),
        profiles: currentState.profiles.map((item) => {
          if (item.id !== linkedProfile?.id) return item
          const emailUnchanged = current.email.toLowerCase() === payload.email.toLowerCase()
          return {
            ...item,
            name: emailUnchanged ? payload.name : item.name,
            role: payload.role,
            updated_at: now,
          }
        }),
      }))
      return { noop: false }
    },

    async toggleProfileActive(profileId, nextActive, input) {
      assertLocalLeader(profile)
      const target = data.profiles.find((item) => item.id === profileId)
      assertRecordExists(target)
      normalizeMasterReason(input.reason)
      assertLocalMasterCurrent(target, input.expectedUpdatedAt)
      if (target.role === 'leader' && target.is_active !== false && !nextActive) {
        const remainingLeaders = data.profiles.filter(
          (item) => item.role === 'leader' && item.is_active !== false && item.id !== profileId,
        )
        if (remainingLeaders.length === 0) {
          throw new UserFacingError('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
        }
      }
      if ((target.is_active ?? true) === nextActive) return { noop: true }
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        profiles: current.profiles.map((item) =>
          item.id === profileId ? { ...item, is_active: nextActive, updated_at: now } : item,
        ),
      }))
      return { noop: false }
    },

    async setProfileRole(profileId, role, input) {
      assertLocalLeader(profile)
      const target = data.profiles.find((item) => item.id === profileId)
      assertRecordExists(target)
      normalizeMasterReason(input.reason)
      assertLocalMasterCurrent(target, input.expectedUpdatedAt)
      if (target.role === 'leader' && target.is_active !== false && role === 'member') {
        const remainingLeaders = data.profiles.filter(
          (item) => item.role === 'leader' && item.is_active !== false && item.id !== profileId,
        )
        if (remainingLeaders.length === 0) {
          throw new UserFacingError('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
        }
      }
      if (target.role === role) return { noop: true }
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        profiles: current.profiles.map((item) =>
          item.id === profileId ? { ...item, role, updated_at: now } : item,
        ),
      }))
      return { noop: false }
    },

    async deleteAllowedUser(id, input) {
      assertLocalLeader(profile)
      const invite = data.allowedUsers.find((item) => item.id === id)
      assertRecordExists(invite)
      normalizeMasterReason(input.reason)
      assertLocalMasterCurrent(invite, input.expectedUpdatedAt)
      setData((current) => removeAllowedUser(current, id))
      return invite.name
    },
  }
}
