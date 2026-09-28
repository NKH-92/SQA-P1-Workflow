import { assertRecordExists, UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type { InviteAdminRepository, RepositoryDeps } from '../repositories/types'
import {
  ACCOUNT_ACTIVE_DELETE_MESSAGE,
  ACCOUNT_EMAIL_LOCKED_MESSAGE,
  LAST_ACTIVE_LEADER_MESSAGE,
  normalizeMasterReason,
} from '../validation/masterOcc'
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
      setData((current) => {
        const email = input.email.toLowerCase()
        // CSV로 먼저 들어온 '가입 전' 행이 있으면 새 행을 만들지 않고 그 행을 고쳐 쓴다(account-admin과 같은 동작).
        const existingAllowed = current.allowedUsers.find((item) => item.email.toLowerCase() === email)
        const linkedProfile = current.profiles.some((item) => item.email.toLowerCase() === email)
        const allowedUsers = existingAllowed && !linkedProfile
          ? current.allowedUsers.map((item) =>
            item.id === existingAllowed.id ? { ...item, name: input.name, role: input.role, updated_at: now } : item,
          )
          : [{ id: makeId('allowed'), ...input, created_at: now, updated_at: now }, ...current.allowedUsers]
        return {
          ...current,
          allowedUsers,
          profiles: [{ id: makeId('profile'), ...input, created_at: now, updated_at: now }, ...current.profiles],
        }
      })
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
      // 서버 가드(SQA_ACCOUNT_EMAIL_LOCKED)와 같게: 가입한 계정은 목록 이메일만 바뀌면 카드와 연결이 끊기므로 막는다.
      // 대소문자만 다른 수정은 연결이 유지되므로 허용한다.
      if (linkedProfile != null && current.email.toLowerCase() !== payload.email.toLowerCase()) {
        throw new UserFacingError(ACCOUNT_EMAIL_LOCKED_MESSAGE)
      }
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
          throw new UserFacingError(LAST_ACTIVE_LEADER_MESSAGE)
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
          throw new UserFacingError(LAST_ACTIVE_LEADER_MESSAGE)
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
      // 서버 가드(SQA_ACCOUNT_ACTIVE)와 같게: 행을 지워도 로그인은 막히지 않으므로 사용 중인 계정은 먼저 비활성화하게 한다.
      const inviteEmail = invite.email.toLowerCase()
      if (data.profiles.some((item) => item.email.toLowerCase() === inviteEmail && item.is_active !== false)) {
        throw new UserFacingError(ACCOUNT_ACTIVE_DELETE_MESSAGE)
      }
      normalizeMasterReason(input.reason)
      assertLocalMasterCurrent(invite, input.expectedUpdatedAt)
      setData((current) => removeAllowedUser(current, id))
      return invite.name
    },
  }
}
