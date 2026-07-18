import { supabase } from '../../lib/supabase'
import type { ActivityLog, AllowedUser, Announcement, AppData, Profile } from '../../types'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }
export type SettledQueryResult<T> = PromiseSettledResult<QueryResult<T>>

export type OptionalQueryResults = {
  allowedUsers: SettledQueryResult<AllowedUser[]>
  profileNotes: SettledQueryResult<AppData['profileNotes']>
  activityLogs: SettledQueryResult<ActivityLog[]>
  leaderProfiles: SettledQueryResult<Array<Pick<Profile, 'id' | 'name'>>>
  announcements: SettledQueryResult<Announcement[]>
}

export async function fetchOptionalQueries(client: Client): Promise<OptionalQueryResults> {
  const [allowedUsers, profileNotes, activityLogs, leaderProfiles, announcements] = await Promise.allSettled([
    client.from('allowed_users').select('*').order('created_at', { ascending: false }),
    client.from('profile_notes').select('*').order('created_at', { ascending: false }),
    client.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
    client.from('public_leader_profiles').select('id,name'),
    client
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200),
  ])
  return {
    allowedUsers: allowedUsers as SettledQueryResult<AllowedUser[]>,
    profileNotes: profileNotes as SettledQueryResult<AppData['profileNotes']>,
    activityLogs: activityLogs as SettledQueryResult<ActivityLog[]>,
    leaderProfiles: leaderProfiles as SettledQueryResult<Array<Pick<Profile, 'id' | 'name'>>>,
    announcements: announcements as SettledQueryResult<Announcement[]>,
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
