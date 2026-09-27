import { PERMISSION_MESSAGE, UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import { fetchOfficeMeeting } from '../fetch/officeMeetingQuery'
import type { OfficeMeetingRepository, RepositoryDeps } from '../repositories/types'
import { canOpenOfficeMeeting, translateOfficeMeetingError, validateOfficeMeetingStart } from '../validation/officeMeeting'

/**
 * 사무실 회의 RPC. 바꾼 뒤에는 회의실만 다시 읽어 내 화면을 바로 맞추고,
 * 다른 사람 화면은 Realtime(useOfficeLiveSync)이 맞춘다.
 */
export function createSupabaseOfficeMeetingRepository(ctx: RepositoryDeps): OfficeMeetingRepository {
  const refresh = async () => {
    try {
      const meeting = await fetchOfficeMeeting()
      ctx.setData((current) => ({ ...current, officeMeeting: meeting }))
    } catch {
      // 다시 읽기에 실패해도 다음 동기화가 맞춘다.
    }
  }

  return {
    async startMeeting(input) {
      if (!canOpenOfficeMeeting(ctx.profile)) throw new UserFacingError(PERMISSION_MESSAGE)
      const request = validateOfficeMeetingStart(input, ctx.profile, ctx.data.officeLayout, ctx.data.memberPresence)
      const { error } = await supabase!.rpc('start_office_meeting', {
        p_title: request.title,
        p_participant_ids: request.invitees,
        p_starts_at: request.startsAt,
        p_location: request.location,
      })
      if (error) throw translateOfficeMeetingError(error)
      await refresh()
    },

    async acknowledgeMeeting(meetingId) {
      const { error } = await supabase!.rpc('acknowledge_office_meeting', { p_meeting_id: meetingId })
      if (error) throw translateOfficeMeetingError(error)
      await refresh()
    },

    async endMeeting(meetingId) {
      const { data, error } = await supabase!.rpc('end_office_meeting', { p_meeting_id: meetingId })
      if (error) throw translateOfficeMeetingError(error)
      await refresh()
      return { ended: data === true }
    },
  }
}
