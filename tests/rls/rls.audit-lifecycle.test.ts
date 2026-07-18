import { createClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseLocalConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseLocalConfigured() ? describe : describe.skip

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Set ${name}`)
  return value
}

describeRls(`RLS authoritative audit lifecycle (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } }

  let leader: ReturnType<typeof createClient>
  let member: ReturnType<typeof createClient>
  let anonymous: ReturnType<typeof createClient>
  let admin: ReturnType<typeof createClient>
  let announcementId: string | null = null

  beforeAll(async () => {
    if (!url || !anonKey) throw new Error('Set local SUPABASE_URL and SUPABASE_ANON_KEY')
    leader = createClient(url, anonKey, clientOptions)
    member = createClient(url, anonKey, clientOptions)
    anonymous = createClient(url, anonKey, clientOptions)
    admin = createClient(url, requiredEnv('SUPABASE_SERVICE_ROLE_KEY'), clientOptions)

    const [leaderSignIn, memberSignIn] = await Promise.all([
      leader.auth.signInWithPassword({
        email: requiredEnv('RLS_LEADER_EMAIL'),
        password: requiredEnv('RLS_LEADER_PASSWORD'),
      }),
      member.auth.signInWithPassword({
        email: requiredEnv('RLS_MEMBER_A_EMAIL'),
        password: requiredEnv('RLS_MEMBER_A_PASSWORD'),
      }),
    ])
    expect(leaderSignIn.error).toBeNull()
    expect(memberSignIn.error).toBeNull()
  })

  afterAll(async () => {
    if (announcementId) await admin.from('announcements').delete().eq('id', announcementId)
  })

  async function auditEventsForAnnouncement() {
    const result = await leader.rpc('list_audit_events', { p_limit: 100, p_before_id: null })
    expect(result.error).toBeNull()
    return (result.data ?? []).filter((event: { entity_id: string | null }) => event.entity_id === announcementId)
  }

  it('records create, update, and delete business evidence without credential-like fields', async () => {
    const title = `Audit lifecycle ${crypto.randomUUID()}`
    const inserted = await leader
      .from('announcements')
      .insert({ title, body: 'Created audit body', is_pinned: false })
      .select('id,title,body,is_pinned,created_by,created_at')
      .single()
    expect(inserted.error).toBeNull()
    announcementId = inserted.data!.id

    let events = await auditEventsForAnnouncement()
    const insertEvent = events.find((event: { action: string }) => event.action === 'inserted')
    expect(insertEvent).toBeTruthy()
    expect(insertEvent.after_delta).toMatchObject({
      id: announcementId,
      title,
      body: 'Created audit body',
      is_pinned: false,
      created_by: requiredEnv('RLS_LEADER_USER_ID'),
    })
    expect(insertEvent.before_delta).toEqual({})

    const updated = await leader
      .from('announcements')
      .update({ body: 'Updated audit body' })
      .eq('id', announcementId)
      .select('id')
      .single()
    expect(updated.error).toBeNull()

    events = await auditEventsForAnnouncement()
    const updateEvent = events.find((event: { action: string }) => event.action === 'updated')
    expect(updateEvent).toMatchObject({
      changed_fields: ['body'],
      before_delta: { body: 'Created audit body' },
      after_delta: { body: 'Updated audit body' },
    })

    const beforeRejectedWriteCount = events.length
    const rejected = await leader.from('announcements').update({ body: '' }).eq('id', announcementId)
    expect(rejected.error).not.toBeNull()
    expect(await auditEventsForAnnouncement()).toHaveLength(beforeRejectedWriteCount)

    const deleted = await leader.from('announcements').delete().eq('id', announcementId).select('id').single()
    expect(deleted.error).toBeNull()
    announcementId = deleted.data!.id

    events = await auditEventsForAnnouncement()
    const deleteEvent = events.find((event: { action: string }) => event.action === 'deleted')
    expect(deleteEvent.before_delta).toMatchObject({
      id: announcementId,
      title,
      body: 'Updated audit body',
      is_pinned: false,
    })
    expect(deleteEvent.after_delta).toEqual({})

    const serialized = JSON.stringify(events).toLowerCase()
    for (const forbidden of ['password', 'encrypted_password', 'token', 'secret', 'service_key', 'session', 'credential']) {
      expect(serialized).not.toContain(forbidden)
    }
    announcementId = null
  })

  it('keeps private audit storage inaccessible and exposes the list RPC only to active leaders', async () => {
    const direct = await leader.schema('private').from('audit_events').select('id').limit(1)
    expect(direct.error).not.toBeNull()

    const memberList = await member.rpc('list_audit_events', { p_limit: 1, p_before_id: null })
    expect(memberList.error).not.toBeNull()

    const anonymousList = await anonymous.rpc('list_audit_events', { p_limit: 1, p_before_id: null })
    expect(anonymousList.error).not.toBeNull()
  })
})
