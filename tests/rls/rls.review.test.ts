import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseLocalConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseLocalConfigured() ? describe : describe.skip

describeRls(`RLS review requests (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  it('blocks member A from reading member B review requests', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const memberBRequestId = process.env.RLS_MEMBER_B_REVIEW_REQUEST_ID

    if (!memberAEmail || !memberAPassword || !memberBRequestId) {
      expect.fail('Set RLS_MEMBER_A_EMAIL, RLS_MEMBER_A_PASSWORD, RLS_MEMBER_B_REVIEW_REQUEST_ID')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await client.auth.signInWithPassword({
      email: memberAEmail,
      password: memberAPassword,
    })
    expect(signInError).toBeNull()

    const { data, error } = await client
      .from('review_requests')
      .select('id')
      .eq('id', memberBRequestId)
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).toBeNull()
  })

  it('allows leader to read all review requests', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD

    if (!leaderEmail || !leaderPassword) {
      expect.fail('Set RLS_LEADER_EMAIL and RLS_LEADER_PASSWORD')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error: signInError } = await client.auth.signInWithPassword({
      email: leaderEmail,
      password: leaderPassword,
    })
    expect(signInError).toBeNull()

    const { data, error } = await client.from('review_requests').select('id').limit(1)
    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('allows member to update own pending review only', async () => {
    const memberAEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberAPassword = process.env.RLS_MEMBER_A_PASSWORD
    const memberARequestId = process.env.RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID

    if (!memberAEmail || !memberAPassword || !memberARequestId) {
      expect.fail(
        'Set RLS_MEMBER_A_EMAIL, RLS_MEMBER_A_PASSWORD, RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID',
      )
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: memberAEmail, password: memberAPassword })

    const { error } = await client
      .from('review_requests')
      .update({ title: 'RLS smoke test title' })
      .eq('id', memberARequestId)
      .eq('status', 'pending')

    expect(error).toBeNull()
  })
})
