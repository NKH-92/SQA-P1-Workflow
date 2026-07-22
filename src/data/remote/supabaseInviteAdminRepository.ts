import { supabase } from '../../lib/supabase'
import type { InviteAdminRepository, RepositoryDeps } from '../repositories/types'
import {
  assertMasterVersion,
  deleteMasterIfCurrent,
  makeMasterCorrelationId,
  normalizeMasterReason,
  runMasterOccRpc,
} from './supabaseMasterShared'

export function createSupabaseInviteAdminRepository(ctx: RepositoryDeps): InviteAdminRepository {
  const { profile, data, setData } = ctx

  return {
    async importInvites(invites) {
      const { error } = await supabase!.from('allowed_users').insert(
        invites.map((invite) => ({ ...invite, created_by: profile.id })),
      )
      if (error) throw error
    },

    async addAllowedUser(input) {
      const { error } = await supabase!.from('allowed_users').insert({
        ...input,
        created_by: profile.id,
      })
      if (error) throw error
    },

    async updateInvite(inviteId, payload) {
      const reason = normalizeMasterReason(payload.reason)
      const expectedUpdatedAt = assertMasterVersion(payload.expectedUpdatedAt)
      const currentInvite = data.allowedUsers.find((item) => item.id === inviteId)
      const linkedProfile = currentInvite
        ? data.profiles.find((item) => item.email.toLowerCase() === currentInvite.email.toLowerCase())
        : undefined
      const updatedAt = await runMasterOccRpc<string>('update_allowed_user_if_current', {
        p_allowed_user_id: inviteId,
        p_expected_updated_at: expectedUpdatedAt,
        p_email: payload.email,
        p_name: payload.name,
        p_role: payload.role,
        p_reason: reason,
        p_correlation_id: makeMasterCorrelationId(),
      })
      if (typeof updatedAt === 'string') {
        setData((current) => ({
          ...current,
          allowedUsers: current.allowedUsers.map((item) => (
            item.id === inviteId
              ? { ...item, email: payload.email, name: payload.name, role: payload.role, updated_at: updatedAt }
              : item
          )),
          profiles: current.profiles.map((item) => {
            if (item.id !== linkedProfile?.id) return item
            const emailUnchanged = currentInvite?.email.toLowerCase() === payload.email.toLowerCase()
            return {
              ...item,
              name: emailUnchanged ? payload.name : item.name,
              role: payload.role,
            }
          }),
        }))
      }
      return { noop: updatedAt === expectedUpdatedAt }
    },

    async toggleProfileActive(profileId, nextActive, input) {
      const reason = normalizeMasterReason(input.reason)
      const expectedUpdatedAt = assertMasterVersion(input.expectedUpdatedAt)
      const updatedAt = await runMasterOccRpc<string>('set_profile_active_if_current', {
        p_profile_id: profileId,
        p_expected_updated_at: expectedUpdatedAt,
        p_is_active: nextActive,
        p_reason: reason,
        p_correlation_id: makeMasterCorrelationId(),
      })
      if (typeof updatedAt === 'string') {
        setData((current) => ({
          ...current,
          profiles: current.profiles.map((item) => (item.id === profileId ? { ...item, updated_at: updatedAt } : item)),
        }))
      }
      return { noop: updatedAt === expectedUpdatedAt }
    },

    async setProfileRole(profileId, role, input) {
      const reason = normalizeMasterReason(input.reason)
      const expectedUpdatedAt = assertMasterVersion(input.expectedUpdatedAt)
      const updatedAt = await runMasterOccRpc<string>('set_profile_role_if_current', {
        p_profile_id: profileId,
        p_expected_updated_at: expectedUpdatedAt,
        p_role: role,
        p_reason: reason,
        p_correlation_id: makeMasterCorrelationId(),
      })
      if (typeof updatedAt === 'string') {
        setData((current) => ({
          ...current,
          profiles: current.profiles.map((item) => (
            item.id === profileId ? { ...item, role, updated_at: updatedAt } : item
          )),
        }))
      }
      return { noop: updatedAt === expectedUpdatedAt }
    },

    async deleteAllowedUser(id, input) {
      const invite = data.allowedUsers.find((item) => item.id === id)
      await deleteMasterIfCurrent('delete_allowed_user_if_current', id, input)
      return invite?.name ?? null
    },
  }
}
