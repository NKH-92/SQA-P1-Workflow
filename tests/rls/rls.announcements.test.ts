import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name}`)
  return value
}

describeRls(`RLS announcements (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

  let leader: ReturnType<typeof createClient>
  let leaderB: ReturnType<typeof createClient>
  let member: ReturnType<typeof createClient>
  let inactiveMember: ReturnType<typeof createClient>
  let pendingPasswordMember: ReturnType<typeof createClient>
  let anonymous: ReturnType<typeof createClient>
  let admin: ReturnType<typeof createClient>
  let announcementId: string | null = null

  beforeAll(async () => {
    if (!url || !anonKey) throw new Error('Set local SUPABASE_URL and SUPABASE_ANON_KEY')
    leader = createClient(url, anonKey, clientOptions)
    leaderB = createClient(url, anonKey, clientOptions)
    member = createClient(url, anonKey, clientOptions)
    inactiveMember = createClient(url, anonKey, clientOptions)
    pendingPasswordMember = createClient(url, anonKey, clientOptions)
    anonymous = createClient(url, anonKey, clientOptions)
    admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), clientOptions)

    const signIns = await Promise.all([
      leader.auth.signInWithPassword({
        email: requiredEnv('RLS_LEADER_EMAIL'),
        password: requiredEnv('RLS_LEADER_PASSWORD'),
      }),
      leaderB.auth.signInWithPassword({
        email: requiredEnv('RLS_LEADER_B_EMAIL'),
        password: requiredEnv('RLS_LEADER_B_PASSWORD'),
      }),
      member.auth.signInWithPassword({
        email: requiredEnv('RLS_MEMBER_A_EMAIL'),
        password: requiredEnv('RLS_MEMBER_A_PASSWORD'),
      }),
      inactiveMember.auth.signInWithPassword({
        email: requiredEnv('RLS_INACTIVE_MEMBER_EMAIL'),
        password: requiredEnv('RLS_INACTIVE_MEMBER_PASSWORD'),
      }),
      pendingPasswordMember.auth.signInWithPassword({
        email: requiredEnv('RLS_PENDING_PASSWORD_EMAIL'),
        password: requiredEnv('RLS_PENDING_PASSWORD'),
      }),
    ])

    for (const result of signIns) expect(result.error).toBeNull()
  })

  afterAll(async () => {
    if (announcementId) {
      await admin.from('announcements').delete().eq('id', announcementId)
    }
  })

  it('lets an active leader create a trimmed pinned announcement', async () => {
    const uniqueTitle = `RLS Announcement ${crypto.randomUUID()}`
    const { data, error } = await leader
      .from('announcements')
      .insert({
        title: `  ${uniqueTitle}  `,
        body: '  Announcement body  ',
        is_pinned: true,
      })
      .select('*')
      .single()

    expect(error).toBeNull()
    expect(data).toMatchObject({
      title: uniqueTitle,
      body: 'Announcement body',
      is_pinned: true,
      created_by: requiredEnv('RLS_LEADER_USER_ID'),
    })
    expect(data?.pinned_at).toBeTruthy()
    expect(data?.created_at).toBeTruthy()
    expect(data?.updated_at).toBeTruthy()
    announcementId = data?.id ?? null
    expect(announcementId).toBeTruthy()
  })

  it('lets active members read announcements but blocks all member writes', async () => {
    expect(announcementId).toBeTruthy()

    const read = await member.from('announcements').select('id,title').eq('id', announcementId!).single()
    expect(read.error).toBeNull()
    expect(read.data?.id).toBe(announcementId)

    const inserted = await member.from('announcements').insert({
      title: 'Member cannot publish',
      body: 'blocked',
      is_pinned: false,
    })
    expect(inserted.error).not.toBeNull()

    const updated = await member
      .from('announcements')
      .update({ title: 'Member cannot edit' })
      .eq('id', announcementId!)
      .select('id')
    expect(updated.error).toBeNull()
    expect(updated.data).toEqual([])

    const deleted = await member.from('announcements').delete().eq('id', announcementId!).select('id')
    expect(deleted.error).toBeNull()
    expect(deleted.data).toEqual([])
  })

  it('blocks anonymous and inactive reads but allows an active password-pending user to read', async () => {
    expect(announcementId).toBeTruthy()

    const anonymousRead = await anonymous.from('announcements').select('id').eq('id', announcementId!)
    expect(anonymousRead.error).not.toBeNull()

    const inactiveRead = await inactiveMember.from('announcements').select('id').eq('id', announcementId!)
    expect(inactiveRead.error).toBeNull()
    expect(inactiveRead.data).toEqual([])

    const pendingRead = await pendingPasswordMember
      .from('announcements')
      .select('id')
      .eq('id', announcementId!)
      .single()
    expect(pendingRead.error).toBeNull()
    expect(pendingRead.data?.id).toBe(announcementId)
  })

  it('manages pinned_at on the server and keeps it stable while pinned', async () => {
    expect(announcementId).toBeTruthy()

    const unpinned = await leader
      .from('announcements')
      .update({ is_pinned: false })
      .eq('id', announcementId!)
      .select('is_pinned,pinned_at')
      .single()
    expect(unpinned.error).toBeNull()
    expect(unpinned.data).toEqual({ is_pinned: false, pinned_at: null })

    const pinned = await leader
      .from('announcements')
      .update({ is_pinned: true })
      .eq('id', announcementId!)
      .select('is_pinned,pinned_at')
      .single()
    expect(pinned.error).toBeNull()
    expect(pinned.data?.is_pinned).toBe(true)
    expect(pinned.data?.pinned_at).toBeTruthy()

    const edited = await leaderB
      .from('announcements')
      .update({ body: 'Edited by another active leader' })
      .eq('id', announcementId!)
      .select('body,pinned_at')
      .single()
    expect(edited.error).toBeNull()
    expect(edited.data?.body).toBe('Edited by another active leader')
    expect(edited.data?.pinned_at).toBe(pinned.data?.pinned_at)

    const clientPinnedAtWrite = await leader
      .from('announcements')
      .update({ pinned_at: null })
      .eq('id', announcementId!)
    expect(clientPinnedAtWrite.error).not.toBeNull()
  })

  it('enforces immutable creation fields even for a service-role write', async () => {
    expect(announcementId).toBeTruthy()

    const creatorChange = await admin
      .from('announcements')
      .update({ created_by: requiredEnv('RLS_LEADER_B_USER_ID') })
      .eq('id', announcementId!)
    expect(creatorChange.error?.message).toContain('announcements.created_by cannot be changed')

    const createdAtChange = await admin
      .from('announcements')
      .update({ created_at: '2000-01-01T00:00:00.000Z' })
      .eq('id', announcementId!)
    expect(createdAtChange.error?.message).toContain('announcements.created_at cannot be changed')
  })

  it('rejects blank or oversized announcement content', async () => {
    const blankTitle = await leader.from('announcements').insert({
      title: '   ',
      body: 'valid',
      is_pinned: false,
    })
    expect(blankTitle.error).not.toBeNull()

    const longTitle = await leader.from('announcements').insert({
      title: 'x'.repeat(201),
      body: 'valid',
      is_pinned: false,
    })
    expect(longTitle.error).not.toBeNull()

    const longBody = await leader.from('announcements').insert({
      title: 'valid',
      body: 'x'.repeat(20001),
      is_pinned: false,
    })
    expect(longBody.error).not.toBeNull()
  })

  it('lets another active leader delete the announcement', async () => {
    expect(announcementId).toBeTruthy()

    const deleted = await leaderB.from('announcements').delete().eq('id', announcementId!).select('id').single()
    expect(deleted.error).toBeNull()
    expect(deleted.data?.id).toBe(announcementId)
    announcementId = null
  })
})
