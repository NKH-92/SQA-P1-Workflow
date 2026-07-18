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

  it('denies direct member updates and allows the OCC review RPC', async () => {
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

    const snapshot = await client
      .from('review_requests')
      .select('title,description,due_date,updated_at')
      .eq('id', memberARequestId)
      .single()
    expect(snapshot.error).toBeNull()

    const direct = await client
      .from('review_requests')
      .update({ title: 'RLS smoke test title' })
      .eq('id', memberARequestId)
      .eq('status', 'pending')
    expect(direct.error).not.toBeNull()

    const viaRpc = await client.rpc('update_review_request', {
      p_review_request_id: memberARequestId,
      p_expected_updated_at: snapshot.data!.updated_at,
      p_title: 'RLS smoke test title',
      p_description: snapshot.data!.description,
      p_due_date: snapshot.data!.due_date,
    })
    expect(viaRpc.error).toBeNull()
  })

  it('blocks direct status updates but allows the OCC approval RPC', async () => {
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const requestId = process.env.RLS_MEMBER_A_PENDING_REVIEW_REQUEST_ID
    if (!leaderEmail || !leaderPassword || !requestId) {
      expect.fail('Set leader credentials and member A pending review fixture')
    }

    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    await client.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })

    const snapshot = await client
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(snapshot.error).toBeNull()

    const direct = await client.from('review_requests').update({ status: 'approved' }).eq('id', requestId)
    expect(direct.error).not.toBeNull()

    const viaRpc = await client.rpc('approve_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: snapshot.data!.updated_at,
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
    const leaderSnapshot = await leader
      .from('review_requests')
      .select('updated_at')
      .eq('id', leaderRequestId)
      .single()
    expect(leaderSnapshot.error).toBeNull()
    const leaderResult = await leader.rpc('reopen_review_request', {
      p_review_request_id: leaderRequestId,
      p_expected_updated_at: leaderSnapshot.data!.updated_at,
    })
    expect(leaderResult.error).toBeNull()

    const member = createClient(url, anonKey, { auth: { persistSession: false } })
    await member.auth.signInWithPassword({ email: memberEmail, password: memberPassword })
    const memberSnapshot = await member
      .from('review_requests')
      .select('updated_at')
      .eq('id', memberRequestId)
      .single()
    expect(memberSnapshot.error).toBeNull()
    const memberResult = await member.rpc('reopen_review_request', {
      p_review_request_id: memberRequestId,
      p_expected_updated_at: memberSnapshot.data!.updated_at,
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
    const snapshot = await client
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(snapshot.error).toBeNull()
    const results = await Promise.all([
      client.rpc('reopen_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: snapshot.data!.updated_at,
      }),
      client.rpc('reopen_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: snapshot.data!.updated_at,
      }),
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

  it('keeps repeated reject/resubmit cycles on one request with ordered author history', async () => {
    const memberEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberPassword = process.env.RLS_MEMBER_A_PASSWORD
    const otherMemberEmail = process.env.RLS_MEMBER_B_EMAIL
    const otherMemberPassword = process.env.RLS_MEMBER_B_PASSWORD
    const leaderEmail = process.env.RLS_LEADER_EMAIL
    const leaderPassword = process.env.RLS_LEADER_PASSWORD
    const requestId = process.env.RLS_RESUBMIT_HISTORY_REVIEW_REQUEST_ID
    if (
      !memberEmail || !memberPassword || !otherMemberEmail || !otherMemberPassword ||
      !leaderEmail || !leaderPassword || !requestId
    ) {
      expect.fail('Set member, other-member, leader credentials and resubmit history fixture')
    }

    const otherMember = createClient(url, anonKey, { auth: { persistSession: false } })
    await otherMember.auth.signInWithPassword({ email: otherMemberEmail, password: otherMemberPassword })
    const foreignAttempt = await otherMember.rpc('resubmit_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: new Date(0).toISOString(),
      p_comment: 'foreign resubmit',
    })
    expect(foreignAttempt.error).not.toBeNull()

    const member = createClient(url, anonKey, { auth: { persistSession: false } })
    await member.auth.signInWithPassword({ email: memberEmail, password: memberPassword })
    const editSnapshot = await member
      .from('review_requests')
      .select('description,due_date,updated_at')
      .eq('id', requestId)
      .single()
    expect(editSnapshot.error).toBeNull()

    const edit = await member.rpc('update_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: editSnapshot.data!.updated_at,
      p_title: 'Resubmit history fixture corrected',
      p_description: editSnapshot.data!.description,
      p_due_date: editSnapshot.data!.due_date,
    })
    expect(edit.error).toBeNull()

    const firstResubmitSnapshot = await member
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(firstResubmitSnapshot.error).toBeNull()

    const firstResubmit = await member.rpc('resubmit_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: firstResubmitSnapshot.data!.updated_at,
      p_comment: 'first correction complete',
    })
    expect(firstResubmit.error).toBeNull()

    const leader = createClient(url, anonKey, { auth: { persistSession: false } })
    await leader.auth.signInWithPassword({ email: leaderEmail, password: leaderPassword })
    const rejectSnapshot = await leader
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(rejectSnapshot.error).toBeNull()
    const secondReject = await leader.rpc('reject_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: rejectSnapshot.data!.updated_at,
      p_comment: 'second rejection reason',
    })
    expect(secondReject.error).toBeNull()

    const secondResubmitSnapshot = await member
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(secondResubmitSnapshot.error).toBeNull()
    const secondResubmit = await member.rpc('resubmit_review_request', {
      p_review_request_id: requestId,
      p_expected_updated_at: secondResubmitSnapshot.data!.updated_at,
      p_comment: 'second correction complete',
    })
    expect(secondResubmit.error).toBeNull()

    const { data, error } = await member
      .from('review_requests')
      .select('id,title,status,review_round,rejection_count,review_feedback(id,author_role,comment,created_at)')
      .eq('id', requestId)
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBe(requestId)
    expect(data?.title).toBe('Resubmit history fixture corrected')
    expect(data?.status).toBe('pending')
    expect(data?.review_round).toBe(3)
    expect(data?.rejection_count).toBe(2)
    expect(data?.review_feedback).toHaveLength(4)
    expect(data?.review_feedback.filter((item) => item.author_role === 'leader')).toHaveLength(2)
    expect(data?.review_feedback.filter((item) => item.author_role === 'member')).toHaveLength(2)
  })

  it('serializes concurrent member resubmission attempts so only one succeeds', async () => {
    const memberEmail = process.env.RLS_MEMBER_A_EMAIL
    const memberPassword = process.env.RLS_MEMBER_A_PASSWORD
    const requestId = process.env.RLS_RESUBMIT_CONCURRENCY_REVIEW_REQUEST_ID
    if (!memberEmail || !memberPassword || !requestId) {
      expect.fail('Set member credentials and resubmit concurrency fixture')
    }

    const member = createClient(url, anonKey, { auth: { persistSession: false } })
    await member.auth.signInWithPassword({ email: memberEmail, password: memberPassword })
    const snapshot = await member
      .from('review_requests')
      .select('updated_at')
      .eq('id', requestId)
      .single()
    expect(snapshot.error).toBeNull()
    const results = await Promise.all([
      member.rpc('resubmit_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: snapshot.data!.updated_at,
        p_comment: 'concurrent correction A',
      }),
      member.rpc('resubmit_review_request', {
        p_review_request_id: requestId,
        p_expected_updated_at: snapshot.data!.updated_at,
        p_comment: 'concurrent correction B',
      }),
    ])
    expect(results.filter((result) => !result.error)).toHaveLength(1)

    const { data, error } = await member
      .from('review_requests')
      .select('id,status,review_round,review_feedback(id,author_role)')
      .eq('id', requestId)
      .single()
    expect(error).toBeNull()
    expect(data?.id).toBe(requestId)
    expect(data?.status).toBe('pending')
    expect(data?.review_round).toBe(2)
    expect(data?.review_feedback.filter((item) => item.author_role === 'member')).toHaveLength(1)
  })

  it('denies every authenticated direct feedback update and delete', async () => {
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
    expect(ownerUpdate.error).not.toBeNull()
    const foreignUpdate = await leader.from('review_feedback').update({ comment: 'foreign edit' }).eq('id', otherAuthorId).select('id')
    expect(foreignUpdate.error).not.toBeNull()
    // Direct writes stay blocked regardless of which feedback column is targeted.
    const protectedColumns = await leader
      .from('review_feedback')
      .update({ leader_id: '00000000-0000-0000-0000-000000000000' })
      .eq('id', otherAuthorId)
    expect(protectedColumns.error).not.toBeNull()

    const leaderB = createClient(url, anonKey, { auth: { persistSession: false } })
    await leaderB.auth.signInWithPassword({ email: leaderBEmail, password: leaderBPassword })
    const ownerDelete = await leaderB.from('review_feedback').delete().eq('id', otherAuthorId)
    expect(ownerDelete.error).not.toBeNull()
  })
})
