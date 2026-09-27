import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { fetchMemberPresence } from '../fetch/memberPresenceQuery'
import type { PresenceRepository, RepositoryDeps } from '../repositories/types'
import {
  canEditPresence,
  hasPresence,
  isMemberStatusKind,
  MEMBER_PRESENCE_FORBIDDEN_MESSAGE,
  MEMBER_PRESENCE_INVALID_MESSAGE,
  MEMBER_PRESENCE_TARGET_MESSAGE,
  translateMemberPresenceError,
  validateMemberLeave,
} from '../validation/memberPresence'

/**
 * 자리 상태 RPC. 바꾼 뒤에는 상태만 다시 읽어 내 화면을 바로 맞추고,
 * 다른 사람 화면은 Realtime(useOfficeLiveSync)이 맞춘다.
 */
export function createSupabasePresenceRepository(ctx: RepositoryDeps): PresenceRepository {
  const refresh = async () => {
    try {
      const presence = await fetchMemberPresence()
      if (presence) ctx.setData((current) => ({ ...current, memberPresence: presence }))
    } catch {
      // 다시 읽기에 실패해도 다음 동기화가 맞춘다.
    }
  }

  // 내 상태는 늘 바꿀 수 있고, 다른 사람 상태는 파트장만 바꾼다(대상 확인은 서버가 한 번 더 한다).
  const assertEditable = (profileId: string) => {
    if (!canEditPresence(ctx.profile, ctx.profile)) throw new UserFacingError(PERMISSION_MESSAGE)
    if (profileId === ctx.profile.id) return
    if (ctx.profile.role !== 'leader') throw new UserFacingError(MEMBER_PRESENCE_FORBIDDEN_MESSAGE)
    const target = ctx.data.profiles.find((profile) => profile.id === profileId)
    if (target && !hasPresence(target)) throw new UserFacingError(MEMBER_PRESENCE_TARGET_MESSAGE)
  }

  return {
    async setStatus(profileId, status) {
      assertEditable(profileId)
      if (status !== null && !isMemberStatusKind(status)) throw new UserFacingError(MEMBER_PRESENCE_INVALID_MESSAGE)
      const { error } = await supabase!.rpc('set_member_status', { p_profile_id: profileId, p_status: status })
      if (error) throw translateMemberPresenceError(error)
      await refresh()
    },

    async addLeave(input) {
      assertEditable(input.profileId)
      const leave = validateMemberLeave(input, ctx.data.memberPresence)
      const { error } = await supabase!.rpc('add_member_leave', {
        p_profile_id: leave.profileId,
        p_kind: leave.kind,
        p_starts_on: leave.startsOn,
        p_ends_on: leave.endsOn,
        p_note: leave.note,
      })
      if (error) throw translateMemberPresenceError(error)
      await refresh()
    },

    async deleteLeave(leaveId) {
      const { data, error } = await supabase!.rpc('delete_member_leave', { p_leave_id: leaveId })
      if (error) throw translateMemberPresenceError(error)
      await refresh()
      return { removed: data === true }
    },
  }
}
