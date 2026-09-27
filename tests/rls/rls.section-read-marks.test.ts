import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const suite = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

type ReadMark = { user_id: string; section: string; seen_keys: string[]; seen_at: string }

const KEY_A = '0a0a0a0a-0000-4000-8000-00000000000a'
const KEY_B = '0b0b0b0b-0000-4000-8000-00000000000b'

suite(`RLS section read marks (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  let leader: SupabaseClient
  let member: SupabaseClient
  let otherMember: SupabaseClient
  let teamLeader: SupabaseClient
  let inactive: SupabaseClient
  let pending: SupabaseClient
  let anonymous: SupabaseClient
  let admin: SupabaseClient

  const signIn = async (client: SupabaseClient, email: string, password: string) => {
    const { error } = await client.auth.signInWithPassword({ email: requiredEnv(email), password: requiredEnv(password) })
    expect(error).toBeNull()
  }

  const marks = async (client: SupabaseClient) => {
    const { data, error } = await client.rpc('get_section_read_marks')
    expect(error).toBeNull()
    return data as ReadMark[]
  }

  const clear = () => admin.from('section_read_marks').delete().not('user_id', 'is', null)

  beforeAll(async () => {
    if (!url || !anonKey) throw new Error('Set local SUPABASE_URL and SUPABASE_ANON_KEY')
    leader = createClient(url, anonKey, options)
    member = createClient(url, anonKey, options)
    otherMember = createClient(url, anonKey, options)
    teamLeader = createClient(url, anonKey, options)
    inactive = createClient(url, anonKey, options)
    pending = createClient(url, anonKey, options)
    anonymous = createClient(url, anonKey, options)
    admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), options)
    await Promise.all([
      signIn(leader, 'RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD'),
      signIn(member, 'RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD'),
      signIn(otherMember, 'RLS_MEMBER_B_EMAIL', 'RLS_MEMBER_B_PASSWORD'),
      signIn(teamLeader, 'RLS_TEAM_LEADER_EMAIL', 'RLS_TEAM_LEADER_PASSWORD'),
      signIn(inactive, 'RLS_INACTIVE_MEMBER_EMAIL', 'RLS_INACTIVE_MEMBER_PASSWORD'),
      signIn(pending, 'RLS_PENDING_PASSWORD_EMAIL', 'RLS_PENDING_PASSWORD'),
    ])
    expect((await clear()).error).toBeNull()
  })

  afterAll(async () => {
    await clear()
  })

  it('stores and returns only the caller’s own marks, replacing a section on each visit', async () => {
    expect(await marks(member)).toEqual([])

    const first = await member.rpc('mark_section_seen', { p_section: 'announcements', p_keys: [KEY_B, KEY_A, KEY_A] })
    expect(first.error).toBeNull()
    expect(typeof first.data).toBe('string')

    const [saved] = await marks(member)
    expect(saved).toMatchObject({
      user_id: requiredEnv('RLS_MEMBER_A_USER_ID'),
      section: 'announcements',
      seen_keys: [KEY_A, KEY_B],
    })
    expect(saved.seen_at).toBeTruthy()

    const replaced = await member.rpc('mark_section_seen', { p_section: 'announcements', p_keys: [KEY_B] })
    expect(replaced.error).toBeNull()
    expect((await marks(member)).map((mark) => mark.seen_keys)).toEqual([[KEY_B]])

    // 다른 사람은 내 기록을 볼 수 없다.
    expect(await marks(otherMember)).toEqual([])
    expect(await marks(leader)).toEqual([])
  })

  it('lets the leader keep marks for change applications', async () => {
    const result = await leader.rpc('mark_section_seen', { p_section: 'change-applications', p_keys: [] })
    expect(result.error).toBeNull()
    expect(await marks(leader)).toEqual([
      expect.objectContaining({ user_id: requiredEnv('RLS_LEADER_USER_ID'), section: 'change-applications', seen_keys: [] }),
    ])
  })

  it('rejects unknown sections and too many or null keys', async () => {
    const cases: Array<[string, unknown, string]> = [
      ['reviews', [], 'SQA_SECTION_INVALID'],
      ['projects', Array.from({ length: 501 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`), 'SQA_SECTION_KEYS_INVALID'],
      ['projects', [KEY_A, null], 'SQA_SECTION_KEYS_INVALID'],
    ]
    for (const [section, keys, detail] of cases) {
      const result = await member.rpc('mark_section_seen', { p_section: section, p_keys: keys })
      expect(result.error?.details ?? result.error?.message).toContain(detail)
    }
  })

  it('keeps team leaders read-only', async () => {
    const result = await teamLeader.rpc('mark_section_seen', { p_section: 'announcements', p_keys: [KEY_A] })
    expect(result.error?.details ?? result.error?.message).toContain('SQA_TEAM_LEADER_READ_ONLY')
    expect(await marks(teamLeader)).toEqual([])
  })

  it('blocks users who cannot use the app and anonymous callers', async () => {
    for (const client of [inactive, pending, anonymous]) {
      const read = await client.rpc('get_section_read_marks')
      expect(read.error).not.toBeNull()
      const write = await client.rpc('mark_section_seen', { p_section: 'projects', p_keys: [] })
      expect(write.error).not.toBeNull()
    }
  })

  it('never exposes the table directly to signed-in users', async () => {
    const select = await member.from('section_read_marks').select('section')
    expect(select.error).not.toBeNull()
    const insert = await member.from('section_read_marks').insert({
      user_id: requiredEnv('RLS_MEMBER_A_USER_ID'),
      section: 'projects',
      seen_keys: [],
    })
    expect(insert.error).not.toBeNull()
  })
})
