import { supabase } from '../../lib/supabase'
import type { MemberPresence } from '../../types'
import { parseMemberPresence } from '../validation/memberPresence'

/**
 * 자리 상태(잠깐 비움·휴가·출장)만 가볍게 다시 읽는다(실시간 알림·짧은 주기 확인용).
 * 전체 데이터를 다시 받지 않아도 사무실 자리 표시가 바로 맞춰진다.
 */
export async function fetchMemberPresence(): Promise<MemberPresence | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_member_presence')
  if (error) throw error
  const parsed = parseMemberPresence(data)
  if (!parsed) throw new Error('SQA_MEMBER_PRESENCE_SHAPE')
  return parsed
}
