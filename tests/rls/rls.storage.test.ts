import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseLocalConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseLocalConfigured() ? describe : describe.skip

describeRls(`RLS review-attachments storage (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  it('allows member to upload only under own user id prefix', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const memberAUserId = process.env.RLS_MEMBER_A_USER_ID

    if (!memberAEmail || !memberAPassword || !memberAUserId) {
      expect.fail('Set RLS_MEMBER_A_EMAIL, RLS_MEMBER_A_PASSWORD, RLS_MEMBER_A_USER_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })

    const ownPath = `${memberAUserId}/rls-smoke.txt`
    const { error: ownUploadError } = await client.storage
      .from('review-attachments')
      .upload(ownPath, new Blob(['rls smoke']), { upsert: true })

    expect(ownUploadError).toBeNull()

    const otherUserId = process.env.RLS_MEMBER_B_USER_ID ?? '00000000-0000-0000-0000-000000000001'
    const foreignPath = `${otherUserId}/rls-smoke.txt`
    const { error: foreignUploadError } = await client.storage
      .from('review-attachments')
      .upload(foreignPath, new Blob(['rls smoke']), { upsert: true })

    expect(foreignUploadError).not.toBeNull()
  })

  it('allows leader to list review attachment objects', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD

    if (!leaderEmail || !leaderPassword) {
      expect.fail('Set RLS_LEADER_EMAIL and RLS_LEADER_PASSWORD')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })

    const { data, error } = await client.storage.from('review-attachments').list('', { limit: 1 })
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })
})
