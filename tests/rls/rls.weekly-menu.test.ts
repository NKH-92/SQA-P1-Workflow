import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const suite = isSupabaseRlsTargetConfigured() ? describe : describe.skip
const BUCKET = 'weekly-menus'
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5f8AAAAASUVORK5CYII=', 'base64')

suite(`RLS weekly menu (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const options = { auth: { persistSession: false, autoRefreshToken: false } }
  const clients = new Map<string, { client: SupabaseClient; id: string }>()
  let admin: SupabaseClient
  const sharedPath = 'current-menu'

  beforeAll(async () => {
    admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, options)
    for (const role of ['MEMBER_A', 'MEMBER_B', 'TEAM_LEADER', 'INACTIVE_MEMBER', 'PENDING_PASSWORD']) {
      const client = createClient(url, key, options)
      const { data, error } = await client.auth.signInWithPassword({
        email: process.env[`RLS_${role}_EMAIL`]!,
        password: process.env[role === 'PENDING_PASSWORD' ? 'RLS_PENDING_PASSWORD' : `RLS_${role}_PASSWORD`]!,
      })
      expect(error).toBeNull()
      clients.set(role, { client, id: data.user!.id })
    }
  })

  afterAll(async () => {
    if (admin) expect((await admin.storage.from(BUCKET).remove([sharedPath, 'extra.png'])).error).toBeNull()
    for (const { client } of clients.values()) await client.auth.signOut({ scope: 'local' })
  })

  it('allows everyone to replace the shared menu while keeping exactly one object', async () => {
    for (const role of ['MEMBER_A', 'TEAM_LEADER']) {
      const { client } = clients.get(role)!
      const result = await client.storage.from(BUCKET).upload(sharedPath, png, { contentType: 'image/png', upsert: true, cacheControl: '0' })
      expect(result.error).toBeNull()
      expect((await clients.get('MEMBER_B')!.client.storage.from(BUCKET).download(sharedPath)).error).toBeNull()
      const objects = await admin.storage.from(BUCKET).list()
      expect(objects.error).toBeNull()
      expect(objects.data?.map((item) => item.name)).toEqual([sharedPath])
    }
  })

  it('rejects anonymous, inactive and password-pending users', async () => {
    const anonymous = { client: createClient(url, key, options) }
    for (const { client } of [anonymous, clients.get('INACTIVE_MEMBER')!, clients.get('PENDING_PASSWORD')!]) {
      expect((await client.storage.from(BUCKET).upload(sharedPath, png, { contentType: 'image/png', upsert: true })).error).not.toBeNull()
      expect((await client.storage.from(BUCKET).download(sharedPath)).error).not.toBeNull()
    }
  })

  it('rejects additional files, unsafe formats and deletion while retaining the previous photo', async () => {
    const { client } = clients.get('MEMBER_A')!
    expect((await client.storage.from(BUCKET).upload('extra.png', png, { contentType: 'image/png' })).error).not.toBeNull()
    expect((await client.storage.from(BUCKET).upload(sharedPath, '<svg/>', { contentType: 'image/svg+xml', upsert: true })).error).not.toBeNull()
    await client.storage.from(BUCKET).remove([sharedPath])
    expect((await clients.get('MEMBER_B')!.client.storage.from(BUCKET).download(sharedPath)).error).toBeNull()
  })
})
