import { supabase } from '../../lib/supabase'
import type { ActivityLog, AllowedUser, Announcement, AppData } from '../../types'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }
export type SettledQueryResult<T> = PromiseSettledResult<QueryResult<T>>

export type OptionalQueryResults = {
  allowedUsers: SettledQueryResult<AllowedUser[]>
  profileNotes: SettledQueryResult<AppData['profileNotes']>
  activityLogs: SettledQueryResult<ActivityLog[]>
  announcements: SettledQueryResult<Announcement[]>
  /** get_office_seats 응답 봉투. 모양 확인은 assembleAppData가 한다. */
  officeLayout: SettledQueryResult<unknown>
  /** get_section_read_marks 응답(내 확인 기록). 모양 확인은 assembleAppData가 한다. */
  sectionReadMarks: SettledQueryResult<unknown>
  /** get_office_meeting 응답(지금 열린 사무실 회의). 모양 확인은 assembleAppData가 한다. */
  officeMeeting: SettledQueryResult<unknown>
  /** get_member_presence 응답(자리 상태·휴가·출장). 모양 확인은 assembleAppData가 한다. */
  memberPresence: SettledQueryResult<unknown>
}

export async function fetchOptionalQueries(client: Client): Promise<OptionalQueryResults> {
  const [allowedUsers, profileNotes, activityLogs, announcements, officeLayout, sectionReadMarks, officeMeeting, memberPresence] = await Promise.allSettled([
    // Fetch one sentinel row beyond each UI cap so truncation is visible rather
    // than silently presenting an incomplete data set as complete.
    client.from('allowed_users').select('*').order('created_at', { ascending: false }).limit(1001),
    client.from('profile_notes').select('*').order('created_at', { ascending: false }).limit(1001),
    client.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(101),
    client
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(201),
    client.rpc('get_office_seats'),
    client.rpc('get_section_read_marks'),
    client.rpc('get_office_meeting'),
    client.rpc('get_member_presence'),
  ])
  return {
    allowedUsers: allowedUsers as SettledQueryResult<AllowedUser[]>,
    profileNotes: profileNotes as SettledQueryResult<AppData['profileNotes']>,
    activityLogs: activityLogs as SettledQueryResult<ActivityLog[]>,
    announcements: announcements as SettledQueryResult<Announcement[]>,
    officeLayout: officeLayout as SettledQueryResult<unknown>,
    sectionReadMarks: sectionReadMarks as SettledQueryResult<unknown>,
    officeMeeting: officeMeeting as SettledQueryResult<unknown>,
    memberPresence: memberPresence as SettledQueryResult<unknown>,
  }
}

export async function fetchAnnouncementById(
  announcementId: string,
  signal?: AbortSignal,
): Promise<Announcement | null> {
  if (!supabase) return null
  let query = supabase.from('announcements').select('*').eq('id', announcementId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return (data as Announcement | null) ?? null
}
