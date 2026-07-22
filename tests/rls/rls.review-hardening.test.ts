import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) expect.fail(`Set ${name}`)
  return value
}

describeRls(`RLS hardened review workflow (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''

  const authenticatedClient = async (emailName: string, passwordName: string) => {
    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({
      email: requiredEnv(emailName),
      password: requiredEnv(passwordName),
    })
    expect(error).toBeNull()
    return client
  }

  it('enforces OCC so exactly one concurrent approval wins and records exact close time', async () => {
    const requestId = requiredEnv('RLS_HARDENED_OCC_REVIEW_REQUEST_ID')
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const snapshot = await leader
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(snapshot.error).toBeNull()

    const staleAttempt = await leader.rpc('approve_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: '2000-01-01T00:00:00.000Z',
    })
    expect(staleAttempt.error).not.toBeNull()

    const attempts = await Promise.all([
      leader.rpc('approve_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: snapshot.data!.updated_at,
      }),
      leader.rpc('approve_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: snapshot.data!.updated_at,
      }),
    ])
    expect(attempts.filter((attempt) => !attempt.error)).toHaveLength(1)

    const result = await leader
      .from('review_requests')
      .select('status,status_changed_at,closed_at')
      .eq('id', requestId)
      .single()
    expect(result.error).toBeNull()
    expect(result.data?.status).toBe('approved')
    expect(result.data?.status_changed_at).toBeTruthy()
    expect(result.data?.closed_at).toBeTruthy()

    const events = await leader
      .from('review_events')
      .select('id')
      .eq('review_request_id', requestId)
      .eq('event_type', 'approved')
    expect(events.error).toBeNull()
    expect(events.data).toHaveLength(1)
  })

  it('soft-withdraws only the requester with a required reason and keeps history', async () => {
    const requestId = requiredEnv('RLS_HARDENED_WITHDRAW_REVIEW_REQUEST_ID')
    const memberA = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberB = await authenticatedClient('RLS_MEMBER_B_EMAIL', 'RLS_MEMBER_B_PASSWORD')
    const snapshot = await memberA
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(snapshot.error).toBeNull()

    const foreignAttempt = await memberB.rpc('withdraw_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: snapshot.data!.updated_at,
      p_reason: 'not my request',
    })
    expect(foreignAttempt.error).not.toBeNull()

    const withdrawal = await memberA.rpc('withdraw_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: snapshot.data!.updated_at,
      p_reason: 'request is no longer needed',
    })
    expect(withdrawal.error).toBeNull()

    const result = await memberA
      .from('review_requests')
      .select('status,closed_at,withdrawn_at,withdrawn_by,withdrawal_reason')
      .eq('id', requestId)
      .single()
    expect(result.error).toBeNull()
    expect(result.data).toMatchObject({
      status: 'withdrawn',
      withdrawn_by: requiredEnv('RLS_MEMBER_A_USER_ID'),
      withdrawal_reason: 'request is no longer needed',
    })
    expect(result.data?.closed_at).toBeTruthy()
    expect(result.data?.withdrawn_at).toBeTruthy()
  })

  it('stores server read receipts while hiding them and foreign review events from members', async () => {
    const requestId = requiredEnv('RLS_HARDENED_RECEIPT_REVIEW_REQUEST_ID')
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const memberA = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberB = await authenticatedClient('RLS_MEMBER_B_EMAIL', 'RLS_MEMBER_B_PASSWORD')

    const marked = await leader.rpc('mark_review_seen', { p_review_request_id: requestId })
    expect(marked.error).toBeNull()
    expect(marked.data).toBeTruthy()

    const leaderReceipt = await leader
      .from('review_read_receipts')
      .select('user_id,review_request_id,last_seen_event_id,read_at')
      .eq('review_request_id', requestId)
      .single()
    expect(leaderReceipt.error).toBeNull()
    expect(leaderReceipt.data?.user_id).toBe(requiredEnv('RLS_LEADER_USER_ID'))

    const hiddenReceipt = await memberA
      .from('review_read_receipts')
      .select('user_id')
      .eq('review_request_id', requestId)
    expect(hiddenReceipt.error).toBeNull()
    expect(hiddenReceipt.data).toEqual([])

    const foreignMark = await memberB.rpc('mark_review_seen', { p_review_request_id: requestId })
    expect(foreignMark.error).not.toBeNull()
    const foreignEvents = await memberB
      .from('review_events')
      .select('id')
      .eq('review_request_id', requestId)
    expect(foreignEvents.error).toBeNull()
    expect(foreignEvents.data).toEqual([])
  })

  it('voids feedback as a tombstone and rejects a foreign leader', async () => {
    const feedbackId = requiredEnv('RLS_HARDENED_FEEDBACK_ID')
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const leaderB = await authenticatedClient('RLS_LEADER_B_EMAIL', 'RLS_LEADER_B_PASSWORD')
    const snapshot = await leader
      .from('review_feedback')
      .select('updated_at')
      .eq('id', feedbackId)
      .single()
    expect(snapshot.error).toBeNull()

    const foreignAttempt = await leaderB.rpc('void_review_feedback', {
      p_feedback_id: feedbackId,
      p_expected_updated_at: snapshot.data!.updated_at,
      p_reason: 'foreign leader attempt',
    })
    expect(foreignAttempt.error).not.toBeNull()

    const result = await leader.rpc('void_review_feedback', {
      p_feedback_id: feedbackId,
      p_expected_updated_at: snapshot.data!.updated_at,
      p_reason: 'guidance was entered in error',
    })
    expect(result.error).toBeNull()

    const tombstone = await leader
      .from('review_feedback')
      .select('id,comment,voided_at,voided_by,void_reason')
      .eq('id', feedbackId)
      .single()
    expect(tombstone.error).toBeNull()
    expect(tombstone.data).toMatchObject({
      id: feedbackId,
      comment: 'Hardened feedback',
      voided_by: requiredEnv('RLS_LEADER_USER_ID'),
      void_reason: 'guidance was entered in error',
    })
    expect(tombstone.data?.voided_at).toBeTruthy()
  })

  it('observes the Auth password change without exposing the removed legacy RPC', async () => {
    const client = await authenticatedClient(
      'RLS_HARDENED_PENDING_PASSWORD_EMAIL',
      'RLS_HARDENED_PENDING_PASSWORD',
    )
    const removedBeforeChange = await client.rpc('mark_password_changed')
    expect(removedBeforeChange.error).not.toBeNull()

    const before = await client
      .from('profiles')
      .select('must_change_password')
      .eq('id', requiredEnv('RLS_HARDENED_PENDING_PASSWORD_USER_ID'))
      .single()
    expect(before.error).toBeNull()
    expect(before.data?.must_change_password).toBe(true)

    const passwordChange = await client.auth.updateUser({ password: 'Rls-Test-Password-2026!-Changed' })
    expect(passwordChange.error).toBeNull()
    const after = await client
      .from('profiles')
      .select('must_change_password')
      .eq('id', requiredEnv('RLS_HARDENED_PENDING_PASSWORD_USER_ID'))
      .single()
    expect(after.error).toBeNull()
    expect(after.data?.must_change_password).toBe(false)

    const removedAfterChange = await client.rpc('mark_password_changed')
    expect(removedAfterChange.error).not.toBeNull()
  })

  it('blocks physical profile deletion even for the service role', async () => {
    const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
    const profileId = requiredEnv('RLS_HARDENED_PENDING_PASSWORD_USER_ID')
    const admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const deletion = await admin.from('profiles').delete().eq('id', profileId).select('id')
    expect(deletion.error).not.toBeNull()
    const retained = await admin.from('profiles').select('id').eq('id', profileId).single()
    expect(retained.error).toBeNull()
    expect(retained.data?.id).toBe(profileId)
  })
})
