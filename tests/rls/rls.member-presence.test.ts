import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const suite = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

type Presence = {
  statuses: Array<{ profile_id: string; name: string; status: string; updated_at: string }>
  leaves: Array<{ id: string; profile_id: string; name: string; kind: string; starts_on: string; ends_on: string; note: string }>
}

function detailOf(error: { details?: string; message?: string } | null) {
  return error?.details ?? error?.message ?? ''
}

/** 서울 날짜에 일수를 더한 YYYY-MM-DD */
function seoulDay(offsetDays = 0) {
  return new Date(Date.now() + offsetDays * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

suite(`RLS member presence (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  let leader: SupabaseClient
  let memberA: SupabaseClient
  let memberB: SupabaseClient
  let teamLeader: SupabaseClient
  let inactive: SupabaseClient
  let pending: SupabaseClient
  let anonymous: SupabaseClient
  let admin: SupabaseClient

  const signIn = async (client: SupabaseClient, email: string, password: string) => {
    const { error } = await client.auth.signInWithPassword({ email: requiredEnv(email), password: requiredEnv(password) })
    expect(error).toBeNull()
  }

  const presence = async (client: SupabaseClient) => {
    const { data, error } = await client.rpc('get_member_presence')
    expect(error).toBeNull()
    return data as Presence
  }

  const clearPresence = async () => {
    expect((await admin.from('member_statuses').delete().not('profile_id', 'is', null)).error).toBeNull()
    expect((await admin.from('member_leaves').delete().not('id', 'is', null)).error).toBeNull()
  }

  const leaveArgs = (profileId: string, kind: string, startsOn: string, endsOn: string, note = '') => ({
    p_profile_id: profileId,
    p_kind: kind,
    p_starts_on: startsOn,
    p_ends_on: endsOn,
    p_note: note,
  })

  beforeAll(async () => {
    if (!url || !anonKey) throw new Error('Set local SUPABASE_URL and SUPABASE_ANON_KEY')
    leader = createClient(url, anonKey, options)
    memberA = createClient(url, anonKey, options)
    memberB = createClient(url, anonKey, options)
    teamLeader = createClient(url, anonKey, options)
    inactive = createClient(url, anonKey, options)
    pending = createClient(url, anonKey, options)
    anonymous = createClient(url, anonKey, options)
    admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), options)
    await Promise.all([
      signIn(leader, 'RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD'),
      signIn(memberA, 'RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD'),
      signIn(memberB, 'RLS_MEMBER_B_EMAIL', 'RLS_MEMBER_B_PASSWORD'),
      signIn(teamLeader, 'RLS_TEAM_LEADER_EMAIL', 'RLS_TEAM_LEADER_PASSWORD'),
      signIn(inactive, 'RLS_INACTIVE_MEMBER_EMAIL', 'RLS_INACTIVE_MEMBER_PASSWORD'),
      signIn(pending, 'RLS_PENDING_PASSWORD_EMAIL', 'RLS_PENDING_PASSWORD'),
    ])
  })

  beforeEach(clearPresence)
  afterAll(clearPresence)

  it('lets people set and clear their own status, visible to the whole part', async () => {
    const memberAId = requiredEnv('RLS_MEMBER_A_USER_ID')
    const set = await memberA.rpc('set_member_status', { p_profile_id: memberAId, p_status: 'lab' })
    expect(set.error).toBeNull()
    expect(set.data).toBe('lab')
    for (const viewer of [leader, memberB, teamLeader]) {
      const statuses = (await presence(viewer)).statuses
      expect(statuses.find((status) => status.profile_id === memberAId)).toMatchObject({ status: 'lab' })
    }
    const switched = await memberA.rpc('set_member_status', { p_profile_id: memberAId, p_status: 'field' })
    expect(switched.error).toBeNull()
    expect((await presence(memberB)).statuses.filter((status) => status.profile_id === memberAId)).toHaveLength(1)

    const cleared = await memberA.rpc('set_member_status', { p_profile_id: memberAId, p_status: null })
    expect(cleared.error).toBeNull()
    expect((await presence(memberB)).statuses.some((status) => status.profile_id === memberAId)).toBe(false)
  })

  it('lets the leader change a member but not members each other, and never team leaders', async () => {
    const memberBId = requiredEnv('RLS_MEMBER_B_USER_ID')
    const byMember = await memberA.rpc('set_member_status', { p_profile_id: memberBId, p_status: 'away' })
    expect(detailOf(byMember.error)).toContain('SQA_MEMBER_PRESENCE_FORBIDDEN')
    const byLeader = await leader.rpc('set_member_status', { p_profile_id: memberBId, p_status: 'away' })
    expect(byLeader.error).toBeNull()

    const byTeamLeader = await teamLeader.rpc('set_member_status', { p_profile_id: requiredEnv('RLS_TEAM_LEADER_USER_ID'), p_status: 'lab' })
    expect(detailOf(byTeamLeader.error)).toContain('SQA_TEAM_LEADER_READ_ONLY')
    const forTeamLeader = await leader.rpc('set_member_status', { p_profile_id: requiredEnv('RLS_TEAM_LEADER_USER_ID'), p_status: 'lab' })
    expect(detailOf(forTeamLeader.error)).toContain('SQA_MEMBER_PRESENCE_TARGET_INVALID')
    const forInactive = await leader.rpc('set_member_status', { p_profile_id: requiredEnv('RLS_INACTIVE_MEMBER_USER_ID'), p_status: 'lab' })
    expect(detailOf(forInactive.error)).toContain('SQA_MEMBER_PRESENCE_TARGET_INVALID')
    const unknown = await memberA.rpc('set_member_status', { p_profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), p_status: 'lunch' })
    expect(detailOf(unknown.error)).toContain('SQA_MEMBER_PRESENCE_INVALID')
  })

  it('registers vacations and trips as whole Seoul days without overlaps', async () => {
    const memberAId = requiredEnv('RLS_MEMBER_A_USER_ID')
    const added = await memberA.rpc('add_member_leave', leaveArgs(memberAId, 'vacation', seoulDay(2), seoulDay(4), '  가족 여행 '))
    expect(added.error).toBeNull()
    const leaves = (await presence(memberB)).leaves
    expect(leaves).toEqual([expect.objectContaining({ id: added.data, kind: 'vacation', starts_on: seoulDay(2), ends_on: seoulDay(4), note: '가족 여행' })])

    const overlap = await memberA.rpc('add_member_leave', leaveArgs(memberAId, 'trip', seoulDay(4), seoulDay(6)))
    expect(detailOf(overlap.error)).toContain('SQA_MEMBER_LEAVE_OVERLAP')
    const cases: Array<[string, string, string]> = [
      ['vacation', seoulDay(5), seoulDay(4)],
      ['vacation', seoulDay(-3), seoulDay(-1)],
      ['vacation', seoulDay(10), seoulDay(100)],
      ['vacation', seoulDay(400), seoulDay(401)],
      ['sick', seoulDay(10), seoulDay(11)],
    ]
    for (const [kind, startsOn, endsOn] of cases) {
      const result = await memberA.rpc('add_member_leave', leaveArgs(memberAId, kind, startsOn, endsOn))
      expect(detailOf(result.error), `${kind} ${startsOn}~${endsOn}`).toContain('SQA_MEMBER_PRESENCE_INVALID')
    }
    const longNote = await memberA.rpc('add_member_leave', leaveArgs(memberAId, 'trip', seoulDay(20), seoulDay(20), '가'.repeat(31)))
    expect(detailOf(longNote.error)).toContain('SQA_MEMBER_PRESENCE_INVALID')
    // 오늘 끝나는 기간은 등록할 수 있다(이미 시작한 휴가를 늦게 적는 경우).
    const started = await memberA.rpc('add_member_leave', leaveArgs(memberAId, 'trip', seoulDay(-2), seoulDay(0)))
    expect(started.error).toBeNull()
  })

  it('lets only the person or the leader cancel a leave, and hides leaves that already ended', async () => {
    const memberBId = requiredEnv('RLS_MEMBER_B_USER_ID')
    const byLeader = await leader.rpc('add_member_leave', leaveArgs(memberBId, 'trip', seoulDay(1), seoulDay(1), '오송'))
    expect(byLeader.error).toBeNull()
    const byOther = await memberA.rpc('delete_member_leave', { p_leave_id: byLeader.data })
    expect(detailOf(byOther.error)).toContain('SQA_MEMBER_PRESENCE_FORBIDDEN')
    const byTeamLeader = await teamLeader.rpc('delete_member_leave', { p_leave_id: byLeader.data })
    expect(byTeamLeader.error).not.toBeNull()
    const own = await memberB.rpc('delete_member_leave', { p_leave_id: byLeader.data })
    expect(own.error).toBeNull()
    expect(own.data).toBe(true)
    const again = await memberB.rpc('delete_member_leave', { p_leave_id: byLeader.data })
    expect(again.data).toBe(false)

    const ended = await admin.from('member_leaves').insert({ profile_id: memberBId, kind: 'vacation', starts_on: seoulDay(-5), ends_on: seoulDay(-3) })
    expect(ended.error).toBeNull()
    expect((await presence(memberA)).leaves).toEqual([])
  })

  it('lets app users read presence for realtime but never write the tables directly', async () => {
    const memberAId = requiredEnv('RLS_MEMBER_A_USER_ID')
    expect((await memberA.rpc('set_member_status', { p_profile_id: memberAId, p_status: 'lab' })).error).toBeNull()
    const rows = await memberB.from('member_statuses').select('profile_id, status')
    expect(rows.error).toBeNull()
    expect(rows.data).toEqual([{ profile_id: memberAId, status: 'lab' }])

    const insert = await memberB.from('member_statuses').insert({ profile_id: requiredEnv('RLS_MEMBER_B_USER_ID'), status: 'lab' })
    expect(insert.error).not.toBeNull()
    const update = await memberB.from('member_statuses').update({ status: 'away' }).eq('profile_id', memberAId)
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true)
    const leaveInsert = await memberB.from('member_leaves').insert({ profile_id: memberAId, kind: 'trip', starts_on: seoulDay(1), ends_on: seoulDay(1) })
    expect(leaveInsert.error).not.toBeNull()
    expect((await presence(memberA)).statuses.find((status) => status.profile_id === memberAId)?.status).toBe('lab')
  })

  it('blocks users who cannot use the app and anonymous callers', async () => {
    for (const client of [inactive, pending, anonymous]) {
      expect((await client.rpc('get_member_presence')).error).not.toBeNull()
      expect((await client.rpc('set_member_status', { p_profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), p_status: 'lab' })).error).not.toBeNull()
      const selected = await client.from('member_statuses').select('profile_id')
      expect(selected.error !== null || (selected.data ?? []).length === 0).toBe(true)
    }
  })
})
