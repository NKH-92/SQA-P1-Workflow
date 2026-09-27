import { supabase } from '../../lib/supabase'
import type { OfficeMeeting } from '../../types'
import { parseOfficeMeeting } from '../validation/officeMeeting'

/**
 * 지금 열린 사무실 회의만 가볍게 다시 읽는다(실시간 알림·짧은 주기 확인용).
 * 전체 데이터를 다시 받지 않아도 회의실과 확인 상태가 바로 맞춰진다.
 */
export async function fetchOfficeMeeting(): Promise<OfficeMeeting | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_office_meeting')
  if (error) throw error
  const parsed = parseOfficeMeeting(data)
  if (!parsed) throw new Error('SQA_OFFICE_MEETING_SHAPE')
  return parsed.meeting
}
