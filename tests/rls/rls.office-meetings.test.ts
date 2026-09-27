import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const suite = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

type Meeting = {
  id: string
  title: string
  organizer_id: string
  organizer_name: string
  created_at: string
  starts_at: string
  location: string
  expires_at: string
  participants: Array<{ user_id: string; name: string; acknowledged_at: string | null }>
}

function detailOf(error: { details?: string; message?: string } | null) {
  return error?.details ?? error?.message ?? ''
}

/** 서울 날짜(YYYY-MM-DD) */
function seoulDay(instant: Date) {
  return instant.toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
}

/** start_office_meeting 인자(시작 시각·장소를 비우면 지금 바로, 사무실 회의실) */
function startArgs(title: unknown, participants: unknown, startsAt: string | null = null, location = '') {
  return { p_title: title, p_participant_ids: participants, p_starts_at: startsAt, p_location: location }
}

suite(`RLS office meetings (${RLS_SKIP_NOTE})`, () => {
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

  const meeting = async (client: SupabaseClient) => {
    const { data, error } = await client.rpc('get_office_meeting')
    expect(error).toBeNull()
    return data as Meeting | null
  }

  const clearMeetings = () => admin.from('office_meetings').delete().not('id', 'is', null)

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
    expect((await clearMeetings()).error).toBeNull()
    expect((await admin.from('office_seats').delete().gte('seat_index', 1)).error).toBeNull()
    const seated = await admin.from('office_seats').insert([
      { seat_index: 1, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'female', style_seed: 1 },
      { seat_index: 2, profile_id: requiredEnv('RLS_MEMBER_B_USER_ID'), gender: 'male', style_seed: 2 },
      { seat_index: 3, profile_id: requiredEnv('RLS_LEADER_USER_ID'), gender: 'male', style_seed: 3 },
    ])
    expect(seated.error).toBeNull()
  })

  beforeEach(async () => {
    expect((await clearMeetings()).error).toBeNull()
  })

  afterAll(async () => {
    await clearMeetings()
    await admin.from('office_seats').delete().gte('seat_index', 1)
  })

  it('lets a member open the room for seated people, with the organizer already confirmed', async () => {
    expect(await meeting(memberA)).toBeNull()
    const started = await memberA.rpc('start_office_meeting', startArgs(
      '  일탈 건 5분 논의  ',
      [requiredEnv('RLS_MEMBER_B_USER_ID'), requiredEnv('RLS_MEMBER_A_USER_ID')],
    ))
    expect(started.error).toBeNull()

    const open = await meeting(leader)
    expect(open).toMatchObject({ id: started.data, title: '일탈 건 5분 논의', organizer_id: requiredEnv('RLS_MEMBER_A_USER_ID') })
    expect(open?.organizer_name.length).toBeGreaterThan(0)
    const byUser = new Map(open!.participants.map((participant) => [participant.user_id, participant]))
    expect(byUser.size).toBe(2)
    expect(byUser.get(requiredEnv('RLS_MEMBER_A_USER_ID'))?.acknowledged_at).not.toBeNull()
    expect(byUser.get(requiredEnv('RLS_MEMBER_B_USER_ID'))?.acknowledged_at).toBeNull()
    expect(open!.location).toBe('')
    expect(open!.starts_at).toBe(open!.created_at)
    expect(Date.parse(open!.expires_at) - Date.parse(open!.starts_at)).toBe(3 * 60 * 60 * 1000)
    // 팀장도 회의실 상황은 볼 수 있다.
    expect((await meeting(teamLeader))?.id).toBe(started.data)
  })

  it('lets invitees confirm once and nobody else', async () => {
    const started = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')]))
    expect(started.error).toBeNull()

    const first = await memberB.rpc('acknowledge_office_meeting', { p_meeting_id: started.data })
    expect(first.error).toBeNull()
    const again = await memberB.rpc('acknowledge_office_meeting', { p_meeting_id: started.data })
    expect(again.data).toBe(first.data)

    const outsider = await leader.rpc('acknowledge_office_meeting', { p_meeting_id: started.data })
    expect(detailOf(outsider.error)).toContain('SQA_OFFICE_MEETING_NOT_FOUND')
  })

  it('holds one meeting at a time', async () => {
    const first = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')]))
    expect(first.error).toBeNull()
    const second = await leader.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_A_USER_ID')]))
    expect(detailOf(second.error)).toContain('SQA_OFFICE_MEETING_BUSY')
  })

  it('lets only the organizer or the leader end the meeting, and the room empties', async () => {
    const started = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')]))
    const byInvitee = await memberB.rpc('end_office_meeting', { p_meeting_id: started.data })
    expect(detailOf(byInvitee.error)).toContain('SQA_OFFICE_MEETING_FORBIDDEN')
    expect((await meeting(memberA))?.id).toBe(started.data)

    const byLeader = await leader.rpc('end_office_meeting', { p_meeting_id: started.data })
    expect(byLeader.error).toBeNull()
    expect(byLeader.data).toBe(true)
    expect(await meeting(memberA)).toBeNull()
    const participants = await admin.from('office_meeting_participants').select('user_id')
    expect(participants.data).toEqual([])

    const repeated = await memberA.rpc('end_office_meeting', { p_meeting_id: started.data })
    expect(repeated.error).toBeNull()
    expect(repeated.data).toBe(false)
  })

  it('treats an expired meeting as gone and lets the room open again', async () => {
    const started = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')]))
    const aged = await admin.from('office_meetings').update({
      created_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      starts_at: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
      expires_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
    }).eq('id', started.data)
    expect(aged.error).toBeNull()
    expect(await meeting(memberB)).toBeNull()
    const late = await memberB.rpc('acknowledge_office_meeting', { p_meeting_id: started.data })
    expect(detailOf(late.error)).toContain('SQA_OFFICE_MEETING_NOT_FOUND')
    const reopened = await memberB.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_A_USER_ID')]))
    expect(reopened.error).toBeNull()
  })

  it('invites only active people seated in the office and checks the input', async () => {
    const cases: Array<[unknown, unknown, string]> = [
      ['', [requiredEnv('RLS_INACTIVE_MEMBER_USER_ID')], 'SQA_OFFICE_MEETING_PARTICIPANT_INVALID'],
      ['', [requiredEnv('RLS_TEAM_LEADER_USER_ID')], 'SQA_OFFICE_MEETING_PARTICIPANT_INVALID'],
      ['', [], 'SQA_OFFICE_MEETING_INVALID'],
      ['', [requiredEnv('RLS_MEMBER_A_USER_ID')], 'SQA_OFFICE_MEETING_INVALID'],
      ['가'.repeat(61), [requiredEnv('RLS_MEMBER_B_USER_ID')], 'SQA_OFFICE_MEETING_INVALID'],
      ['', null, 'SQA_OFFICE_MEETING_INVALID'],
    ]
    for (const [title, participants, detail] of cases) {
      const result = await memberA.rpc('start_office_meeting', startArgs(title, participants))
      expect(detailOf(result.error)).toContain(detail)
    }
    expect(await meeting(memberA)).toBeNull()
  })

  it('keeps team leaders read-only', async () => {
    const byTeamLeader = await teamLeader.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_A_USER_ID')]))
    expect(detailOf(byTeamLeader.error)).toContain('SQA_TEAM_LEADER_READ_ONLY')
    const started = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')]))
    const ended = await teamLeader.rpc('end_office_meeting', { p_meeting_id: started.data })
    expect(ended.error).not.toBeNull()
    expect((await meeting(memberA))?.id).toBe(started.data)
  })

  it('blocks users who cannot use the app and anonymous callers', async () => {
    for (const client of [inactive, pending, anonymous]) {
      expect((await client.rpc('get_office_meeting')).error).not.toBeNull()
      expect((await client.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_A_USER_ID')]))).error).not.toBeNull()
      const selected = await client.from('office_meetings').select('id')
      expect(selected.error !== null || (selected.data ?? []).length === 0).toBe(true)
    }
  })

  it('lets app users read the room for realtime but never write the tables directly', async () => {
    const started = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')]))
    const rows = await memberB.from('office_meetings').select('id')
    expect(rows.error).toBeNull()
    expect(rows.data?.map((row) => row.id)).toEqual([started.data])
    const participantRows = await memberB.from('office_meeting_participants').select('user_id')
    expect(participantRows.error).toBeNull()
    expect(participantRows.data).toHaveLength(2)

    const insert = await memberB.from('office_meetings').insert({
      organizer_id: requiredEnv('RLS_MEMBER_B_USER_ID'),
      organizer_name: 'x',
      starts_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 1000).toISOString(),
    })
    expect(insert.error).not.toBeNull()
    const update = await memberB.from('office_meeting_participants').update({ acknowledged_at: new Date().toISOString() }).eq('meeting_id', started.data)
    expect(update.error !== null || (update.data ?? []).length === 0).toBe(true)
    const removal = await memberB.from('office_meetings').delete().eq('id', started.data)
    expect(removal.error !== null || (removal.data ?? []).length === 0).toBe(true)
    expect((await meeting(memberA))?.id).toBe(started.data)
  })

  it('schedules a meeting later today somewhere else, but never in the past or on another day', async () => {
    const later = new Date(Date.now() + 20 * 60 * 1000)
    if (seoulDay(later) === seoulDay(new Date())) {
      const scheduled = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')], later.toISOString(), '  3층 대회의실 '))
      expect(scheduled.error).toBeNull()
      const open = await meeting(memberB)
      expect(open).toMatchObject({ location: '3층 대회의실' })
      expect(Date.parse(open!.starts_at)).toBe(later.getTime())
      expect(Date.parse(open!.expires_at) - later.getTime()).toBe(3 * 60 * 60 * 1000)
      expect((await clearMeetings()).error).toBeNull()
    }
    const cases: Array<[string, string]> = [
      [new Date(Date.now() - 60 * 60 * 1000).toISOString(), 'SQA_OFFICE_MEETING_TIME_INVALID'],
      [new Date(Date.now() + 26 * 60 * 60 * 1000).toISOString(), 'SQA_OFFICE_MEETING_TIME_INVALID'],
    ]
    for (const [startsAt, detail] of cases) {
      const result = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')], startsAt))
      expect(detailOf(result.error)).toContain(detail)
    }
    const longPlace = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')], null, '가'.repeat(31)))
    expect(detailOf(longPlace.error)).toContain('SQA_OFFICE_MEETING_INVALID')
    expect(await meeting(memberA)).toBeNull()
  })

  it('keeps people on vacation or a business trip that day out of the meeting', async () => {
    const today = seoulDay(new Date())
    const leave = await admin.from('member_leaves').insert({
      profile_id: requiredEnv('RLS_MEMBER_B_USER_ID'),
      kind: 'vacation',
      starts_on: today,
      ends_on: today,
    }).select('id').single()
    expect(leave.error).toBeNull()
    try {
      const refused = await memberA.rpc('start_office_meeting', startArgs('', [requiredEnv('RLS_MEMBER_B_USER_ID')]))
      expect(detailOf(refused.error)).toContain('SQA_OFFICE_MEETING_PARTICIPANT_AWAY')
      expect(await meeting(memberA)).toBeNull()
    } finally {
      await admin.from('member_leaves').delete().eq('id', leave.data!.id)
    }
  })
})
