import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const suite = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

type OfficeEnvelope = {
  revision: string
  seats: Array<{ seat_index: number; profile_id: string; name: string; gender: string; style_seed: number }>
}

suite(`RLS office seats (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  let leader: SupabaseClient
  let member: SupabaseClient
  let teamLeader: SupabaseClient
  let inactive: SupabaseClient
  let pending: SupabaseClient
  let anonymous: SupabaseClient
  let admin: SupabaseClient

  const signIn = async (client: SupabaseClient, email: string, password: string) => {
    const { error } = await client.auth.signInWithPassword({ email: requiredEnv(email), password: requiredEnv(password) })
    expect(error).toBeNull()
  }

  const layout = async (client: SupabaseClient) => {
    const { data, error } = await client.rpc('get_office_seats')
    expect(error).toBeNull()
    return data as OfficeEnvelope
  }

  beforeAll(async () => {
    if (!url || !anonKey) throw new Error('Set local SUPABASE_URL and SUPABASE_ANON_KEY')
    leader = createClient(url, anonKey, options)
    member = createClient(url, anonKey, options)
    teamLeader = createClient(url, anonKey, options)
    inactive = createClient(url, anonKey, options)
    pending = createClient(url, anonKey, options)
    anonymous = createClient(url, anonKey, options)
    admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), options)
    await Promise.all([
      signIn(leader, 'RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD'),
      signIn(member, 'RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD'),
      signIn(teamLeader, 'RLS_TEAM_LEADER_EMAIL', 'RLS_TEAM_LEADER_PASSWORD'),
      signIn(inactive, 'RLS_INACTIVE_MEMBER_EMAIL', 'RLS_INACTIVE_MEMBER_PASSWORD'),
      signIn(pending, 'RLS_PENDING_PASSWORD_EMAIL', 'RLS_PENDING_PASSWORD'),
    ])
    const cleared = await admin.from('office_seats').delete().gte('seat_index', 1)
    expect(cleared.error).toBeNull()
  })

  afterAll(async () => {
    await admin.from('office_seats').delete().gte('seat_index', 1)
  })

  it('lets an active leader replace the whole layout with a matching revision', async () => {
    const before = await layout(leader)
    expect(before.seats).toEqual([])

    const saved = await leader.rpc('replace_office_seats', {
      p_expected_revision: before.revision,
      p_seats: [
        { seat_index: 1, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'female', style_seed: 11 },
        { seat_index: 5, profile_id: requiredEnv('RLS_MEMBER_B_USER_ID'), gender: 'male', style_seed: 22 },
      ],
    })
    expect(saved.error).toBeNull()
    expect(saved.data).toBe(true)

    const after = await layout(leader)
    expect(after.revision).not.toBe(before.revision)
    expect(after.seats.map((seat) => [seat.seat_index, seat.profile_id, seat.gender, seat.style_seed])).toEqual([
      [1, requiredEnv('RLS_MEMBER_A_USER_ID'), 'female', 11],
      [5, requiredEnv('RLS_MEMBER_B_USER_ID'), 'male', 22],
    ])

    const repeated = await leader.rpc('replace_office_seats', {
      p_expected_revision: after.revision,
      p_seats: after.seats.map(({ seat_index, profile_id, gender, style_seed }) => ({ seat_index, profile_id, gender, style_seed })),
    })
    expect(repeated.error).toBeNull()
    expect(repeated.data).toBe(false)
  })

  it('swaps two people in one call and rejects a stale revision', async () => {
    const current = await layout(leader)
    const swapped = await leader.rpc('replace_office_seats', {
      p_expected_revision: current.revision,
      p_seats: [
        { seat_index: 1, profile_id: requiredEnv('RLS_MEMBER_B_USER_ID'), gender: 'male', style_seed: 22 },
        { seat_index: 5, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'female', style_seed: 11 },
      ],
    })
    expect(swapped.error).toBeNull()
    expect(swapped.data).toBe(true)

    const stale = await leader.rpc('replace_office_seats', { p_expected_revision: current.revision, p_seats: [] })
    expect(stale.error?.details ?? stale.error?.message).toContain('SQA_OFFICE_LAYOUT_CONFLICT')
    expect((await layout(leader)).seats).toHaveLength(2)
  })

  it('rejects duplicates, inactive accounts and malformed seats', async () => {
    const { revision } = await layout(leader)
    const cases: Array<[unknown, string]> = [
      [[
        { seat_index: 1, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'female', style_seed: 1 },
        { seat_index: 2, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'female', style_seed: 1 },
      ], 'SQA_OFFICE_SEATS_DUPLICATE'],
      [[{ seat_index: 1, profile_id: requiredEnv('RLS_INACTIVE_MEMBER_USER_ID'), gender: 'male', style_seed: 1 }], 'SQA_OFFICE_SEAT_PROFILE_INACTIVE'],
      [[{ seat_index: 9, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'male', style_seed: 1 }], 'SQA_OFFICE_SEATS_INVALID'],
      [[{ seat_index: 1, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'other', style_seed: 1 }], 'SQA_OFFICE_SEATS_INVALID'],
      [[{ seat_index: 1, profile_id: requiredEnv('RLS_MEMBER_A_USER_ID'), gender: 'male', style_seed: 3000000000 }], 'SQA_OFFICE_SEATS_INVALID'],
      [{ seat_index: 1 }, 'SQA_OFFICE_SEATS_INVALID'],
    ]
    for (const [seats, detail] of cases) {
      const result = await leader.rpc('replace_office_seats', { p_expected_revision: revision, p_seats: seats })
      expect(result.error?.details ?? result.error?.message).toContain(detail)
    }
    expect((await layout(leader)).revision).toBe(revision)
  })

  it('shows members and team leaders the same names but lets neither change the layout', async () => {
    const leaderView = await layout(leader)
    for (const client of [member, teamLeader]) {
      const view = await layout(client)
      expect(view).toEqual(leaderView)
      expect(view.seats.every((seat) => seat.name.length > 0)).toBe(true)
      const attempt = await client.rpc('replace_office_seats', { p_expected_revision: view.revision, p_seats: [] })
      expect(attempt.error).not.toBeNull()
      expect((await layout(leader)).revision).toBe(leaderView.revision)
    }
  })

  it('blocks users who cannot use the app and anonymous callers', async () => {
    for (const client of [inactive, pending, anonymous]) {
      const read = await client.rpc('get_office_seats')
      expect(read.error).not.toBeNull()
      const write = await client.rpc('replace_office_seats', { p_expected_revision: '', p_seats: [] })
      expect(write.error).not.toBeNull()
    }
  })

  it('never exposes the table directly to signed-in users', async () => {
    const select = await leader.from('office_seats').select('seat_index')
    expect(select.error).not.toBeNull()
    const insert = await leader.from('office_seats').insert({
      seat_index: 8,
      profile_id: requiredEnv('RLS_LEADER_USER_ID'),
      gender: 'male',
      style_seed: 1,
    })
    expect(insert.error).not.toBeNull()
    const memberSelect = await member.from('office_seats').select('seat_index')
    expect(memberSelect.error).not.toBeNull()
  })
})
