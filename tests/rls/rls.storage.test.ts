// @vitest-environment node
import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseLocalConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseLocalConfigured() ? describe : describe.skip

describeRls(`RLS removed review attachment storage (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  it('keeps the removed bucket unavailable to authenticated uploads and reads', async () => {
    const memberEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberPassword = process.env.RLS_MEMBER_A_PASSWORD

    if (!memberEmail || !memberPassword) {
      expect.fail('Set RLS_MEMBER_A_EMAIL and RLS_MEMBER_A_PASSWORD')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const signIn = await client.auth.signInWithPassword({ email: memberEmail, password: memberPassword })
    expect(signIn.error).toBeNull()

    const upload = await client.storage
      .from('review-attachments')
      .upload('removed.txt', 'must not upload', { contentType: 'text/plain' })
    expect(upload.error).not.toBeNull()

    const listing = await client.storage.from('review-attachments').list('', { limit: 1 })
    expect(listing.error).not.toBeNull()
  })
})
