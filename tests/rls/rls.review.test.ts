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

  it('blocks direct status updates but allows the leader status RPC', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const requestId = process.env.RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID
    if (!leaderEmail || !leaderPassword || !requestId) {
      expect.fail('Set leader credentials and member A pending review fixture')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })

    const direct = await client.from('review_requests').update({ status: 'approved' }).eq('id', requestId)
    expect(direct.error).not.toBeNull()

    const viaRpc = await client.rpc('update_review_request_status', {
      p_review_request_id: requestId,
      p_status: 'approved',
    })
    expect(viaRpc.error).toBeNull()
  })

  it('allows an active leader to reopen a closed request and rejects a member', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const memberEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberPassword = process.env.RLS_MEMBER_A_PASSWORD
    const leaderRequestId = process.env.RLS_CLOSED_LEADER_REVIEW_REQUEST_ID
    const memberRequestId = process.env.RLS_CLOSED_MEMBER_REVIEW_REQUEST_ID
    if (!leaderEmail || !leaderPassword || !memberEmail || !memberPassword || !leaderRequestId || !memberRequestId) {
      expect.fail('Set leader/member credentials and closed review fixture ids')
    }

    const leader = createClient(url, anonKey, { auth: { persistSession: false } })
    await leader.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const leaderResult = await leader.rpc('reopen_review_request', {
      p_review_request_id: leaderRequestId,
    })
    expect(leaderResult.error).toBeNull()

    const member = createClient(url, anonKey, { auth: { persistSession: false } })
    await member.auth.signInWithPassword({ email: memberEmail, password: memberPassword })
    const memberResult = await member.rpc('reopen_review_request', {
      p_review_request_id: memberRequestId,
    })
    expect(memberResult.error).not.toBeNull()
  })

  it('serializes concurrent reopen attempts so only one succeeds', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const requestId = process.env.RLS_CLOSED_CONCURRENCY_REVIEW_REQUEST_ID
    if (!leaderEmail || !leaderPassword || !requestId) {
      expect.fail('Set leader credentials and closed concurrency review fixture')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const results = await Promise.all([
      client.rpc('reopen_review_request', { p_review_request_id: requestId }),
      client.rpc('reopen_review_request', { p_review_request_id: requestId }),
    ])
    expect(results.filter((result) => !result.error)).toHaveLength(1)

    const { data, error } = await client
      .from('review_requests')
      .select('status')
      .eq('id', requestId)
      .single()
    expect(error).toBeNull()
    expect(data?.status).toBe('pending')
  })

  it('scopes feedback correction to the author and comment column', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const leaderBEmail = process.env.RLS_LEADER_B_EMAIL
    const leaderBPassword = process.env.RLS_LEADER_B_PASSWORD
    const ownerId = process.env.RLS_FEEDBACK_OWNER_ID
    const otherAuthorId = process.env.RLS_FEEDBACK_OTHER_AUTHOR_ID
    if (!leaderEmail || !leaderPassword || !leaderBEmail || !leaderBPassword || !ownerId || !otherAuthorId) {
      expect.fail('Set both leader credentials and feedback fixture ids')
    }

    const leader = createClient(url, anonKey, { auth: { persistSession: false } })
    await leader.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const ownerUpdate = await leader.from('review_feedback').update({ comment: 'owner corrected' }).eq('id', ownerId)
    expect(ownerUpdate.error).toBeNull()
    const foreignUpdate = await leader.from('review_feedback').update({ comment: 'foreign edit' }).eq('id', otherAuthorId).select('id')
    expect(foreignUpdate.error).toBeNull()
    expect(foreignUpdate.data).toEqual([])
    const protectedColumns = await leader.from('review_feedback').update({ leader_id: leader.id }).eq('id', otherAuthorId)
    expect(protectedColumns.error).not.toBeNull()

    const leaderB = createClient(url, anonKey, { auth: { persistSession: false } })
    await leaderB.auth.signInWithPassword({ email: leaderBEmail, password: leaderBPassword })
    const ownerDelete = await leaderB.from('review_feedback').delete().eq('id', otherAuthorId)
    expect(ownerDelete.error).toBeNull()
  })
})
