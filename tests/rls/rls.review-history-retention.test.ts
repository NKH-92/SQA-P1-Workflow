import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip
const KST_OFFSET_MS = 9 * 60 * 60 * 1000

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) expect.fail(`Set ${name}`)
  return value
}

function kstMidnightDaysAgo(daysAgo: number): Date {
  const shifted = new Date(Date.now() + KST_OFFSET_MS)
  return new Date(Date.UTC(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth(),
    shifted.getUTCDate() - daysAgo,
  ) - KST_OFFSET_MS)
}

function kstDateKey(value: string): string {
  return new Date(new Date(value).getTime() + KST_OFFSET_MS).toISOString().slice(0, 10)
}

function historyArgs(overrides: Record<string, unknown> = {}) {
  return {
    p_status: null,
    p_query: null,
    p_from: null,
    p_to: null,
    p_before_terminal_at: null,
    p_before_id: null,
    p_limit: 50,
    ...overrides,
  }
}

describeRls(`RLS review history and retention (${RLS_SKIP_NOTE})`, () => {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? ''
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY ?? ''
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  const createdRequestIds: string[] = []
  const nonce = `history-${Date.now()}`
  let admin: SupabaseClient
  let leader: SupabaseClient
  let member: SupabaseClient
  let recentBoundaryId = ''
  let historyBoundaryId = ''
  let oldPendingId = ''
  let titleMatchId = ''
  let descriptionMatchId = ''
  let requesterMatchId = ''
  let titleMatchTerminalAt = ''

  async function signedIn(emailName: string, passwordName: string) {
    const client = createClient(url, anonKey, { auth: { persistSession: false } })
    const { error } = await client.auth.signInWithPassword({
      email: requiredEnv(emailName),
      password: requiredEnv(passwordName),
    })
    expect(error).toBeNull()
    return client
  }

  beforeAll(async () => {
    admin = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    leader = await signedIn('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    member = await signedIn('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')

    const requesterId = requiredEnv('RLS_MEMBER_A_USER_ID')
    const recentBoundary = kstMidnightDaysAgo(6)
    const historyBoundary = new Date(recentBoundary.getTime() - 1)
    const titleTerminal = new Date(kstMidnightDaysAgo(10).getTime() + 12 * 60 * 60 * 1000)
    const descriptionTerminal = new Date(kstMidnightDaysAgo(11).getTime() + 12 * 60 * 60 * 1000)
    const requesterTerminal = new Date(kstMidnightDaysAgo(12).getTime() + 12 * 60 * 60 * 1000)
    titleMatchTerminalAt = titleTerminal.toISOString()

    const rows = [
      {
        requester_id: requesterId,
        title: `Recent boundary ${nonce}`,
        description: `recent ${nonce}`,
        status: 'approved',
        rejection_count: 0,
        status_changed_at: recentBoundary.toISOString(),
        closed_at: recentBoundary.toISOString(),
        created_at: new Date(recentBoundary.getTime() - 86_400_000).toISOString(),
      },
      {
        requester_id: requesterId,
        title: `History boundary ${nonce}`,
        description: `boundary ${nonce}`,
        status: 'approved',
        rejection_count: 0,
        status_changed_at: historyBoundary.toISOString(),
        closed_at: historyBoundary.toISOString(),
        created_at: new Date(historyBoundary.getTime() - 86_400_000).toISOString(),
      },
      {
        requester_id: requesterId,
        title: `Exact title ${nonce}`,
        description: `common ${nonce}`,
        status: 'approved',
        rejection_count: 0,
        status_changed_at: titleTerminal.toISOString(),
        closed_at: titleTerminal.toISOString(),
        created_at: new Date(titleTerminal.getTime() - 86_400_000).toISOString(),
      },
      {
        requester_id: requesterId,
        title: `Description row ${nonce}`,
        description: `Exact description ${nonce}`,
        status: 'rejected',
        rejection_count: 1,
        status_changed_at: descriptionTerminal.toISOString(),
        closed_at: descriptionTerminal.toISOString(),
        created_at: new Date(descriptionTerminal.getTime() - 86_400_000).toISOString(),
      },
      {
        requester_id: requesterId,
        title: `Requester row ${nonce}`,
        description: `common ${nonce}`,
        status: 'withdrawn',
        rejection_count: 0,
        status_changed_at: requesterTerminal.toISOString(),
        closed_at: requesterTerminal.toISOString(),
        withdrawn_at: requesterTerminal.toISOString(),
        withdrawn_by: requesterId,
        withdrawal_reason: 'RLS history fixture',
        created_at: new Date(requesterTerminal.getTime() - 86_400_000).toISOString(),
      },
      {
        requester_id: requesterId,
        title: `Old pending ${nonce}`,
        description: `common ${nonce}`,
        status: 'pending',
        rejection_count: 0,
        status_changed_at: kstMidnightDaysAgo(400).toISOString(),
        created_at: kstMidnightDaysAgo(400).toISOString(),
      },
    ]

    const result = await admin
      .from('review_requests')
      .insert(rows)
      .select('id,title')
    expect(result.error).toBeNull()
    const byTitle = new Map((result.data ?? []).map((row) => [row.title, row.id]))
    recentBoundaryId = byTitle.get(`Recent boundary ${nonce}`) ?? ''
    historyBoundaryId = byTitle.get(`History boundary ${nonce}`) ?? ''
    titleMatchId = byTitle.get(`Exact title ${nonce}`) ?? ''
    descriptionMatchId = byTitle.get(`Description row ${nonce}`) ?? ''
    requesterMatchId = byTitle.get(`Requester row ${nonce}`) ?? ''
    oldPendingId = byTitle.get(`Old pending ${nonce}`) ?? ''
    createdRequestIds.push(...(result.data ?? []).map((row) => row.id))
    expect([
      recentBoundaryId,
      historyBoundaryId,
      titleMatchId,
      descriptionMatchId,
      requesterMatchId,
      oldPendingId,
    ].every(Boolean)).toBe(true)
  })

  afterAll(async () => {
    if (admin && createdRequestIds.length > 0) {
      await admin.from('review_requests').delete().in('id', createdRequestIds)
    }
  })

  it('allows only active leaders to list terminal history', async () => {
    const allowed = await leader.rpc('list_review_history_v1', historyArgs({ p_query: nonce }))
    expect(allowed.error).toBeNull()
    expect(allowed.data?.schema_version).toBe(1)

    const deniedMember = await member.rpc('list_review_history_v1', historyArgs({ p_query: nonce }))
    expect(deniedMember.error).not.toBeNull()

    const anonymous = createClient(url, anonKey, { auth: { persistSession: false } })
    const deniedAnonymous = await anonymous.rpc('list_review_history_v1', historyArgs({ p_query: nonce }))
    expect(deniedAnonymous.error).not.toBeNull()
  })

  it('searches title, description, and requester while applying status and KST date filters', async () => {
    const titleResult = await leader.rpc('list_review_history_v1', historyArgs({
      p_query: `Exact title ${nonce}`,
    }))
    expect(titleResult.error).toBeNull()
    expect(titleResult.data.rows.map((row: { id: string }) => row.id)).toEqual([titleMatchId])

    const descriptionResult = await leader.rpc('list_review_history_v1', historyArgs({
      p_query: `Exact description ${nonce}`,
    }))
    expect(descriptionResult.error).toBeNull()
    expect(descriptionResult.data.rows.map((row: { id: string }) => row.id)).toEqual([descriptionMatchId])

    const requesterResult = await leader.rpc('list_review_history_v1', historyArgs({
      p_query: 'RLS Member A',
    }))
    expect(requesterResult.error).toBeNull()
    expect(requesterResult.data.rows.some((row: { id: string }) => row.id === requesterMatchId)).toBe(true)

    const rejectedResult = await leader.rpc('list_review_history_v1', historyArgs({
      p_status: 'rejected',
      p_query: nonce,
    }))
    expect(rejectedResult.error).toBeNull()
    expect(rejectedResult.data.rows.map((row: { id: string; status: string }) => [row.id, row.status]))
      .toEqual([[descriptionMatchId, 'rejected']])

    const dateKey = kstDateKey(titleMatchTerminalAt)
    const dateResult = await leader.rpc('list_review_history_v1', historyArgs({
      p_query: nonce,
      p_from: dateKey,
      p_to: dateKey,
    }))
    expect(dateResult.error).toBeNull()
    expect(dateResult.data.rows.map((row: { id: string }) => row.id)).toEqual([titleMatchId])
  })

  it('uses a stable terminal-time and UUID cursor without duplicate rows', async () => {
    const first = await leader.rpc('list_review_history_v1', historyArgs({
      p_query: nonce,
      p_limit: 2,
    }))
    expect(first.error).toBeNull()
    expect(first.data.rows).toHaveLength(2)
    expect(first.data.has_more).toBe(true)
    expect(first.data.next_cursor).toBeTruthy()

    const second = await leader.rpc('list_review_history_v1', historyArgs({
      p_query: nonce,
      p_before_terminal_at: first.data.next_cursor.terminal_at,
      p_before_id: first.data.next_cursor.id,
      p_limit: 2,
    }))
    expect(second.error).toBeNull()
    const firstIds = new Set(first.data.rows.map((row: { id: string }) => row.id))
    expect(second.data.rows.every((row: { id: string }) => !firstIds.has(row.id))).toBe(true)
    expect(new Set([
      ...first.data.rows.map((row: { id: string }) => row.id),
      ...second.data.rows.map((row: { id: string }) => row.id),
    ])).toEqual(new Set([historyBoundaryId, titleMatchId, descriptionMatchId, requesterMatchId]))
  })

  it('keeps all pending requests and exactly seven KST calendar days in the leader bootstrap', async () => {
    const result = await leader.rpc('get_review_bootstrap_v2')
    expect(result.error).toBeNull()
    const ids = new Set(result.data.requests.map((row: { id: string }) => row.id))
    expect(ids.has(oldPendingId)).toBe(true)
    expect(ids.has(recentBoundaryId)).toBe(true)
    expect(ids.has(historyBoundaryId)).toBe(false)
  })

  it('allows a blank-comment rejection without feedback and records explicit metadata and audit reason', async () => {
    const created = await admin
      .from('review_requests')
      .insert({
        requester_id: requiredEnv('RLS_MEMBER_A_USER_ID'),
        title: `Blank rejection ${nonce}`,
        description: 'No comment is required for this rejection.',
        status: 'pending',
        rejection_count: 0,
      })
      .select('id,updated_at')
      .single()
    expect(created.error).toBeNull()
    createdRequestIds.push(created.data!.id)

    const denied = await member.rpc('reject_review_request', {
      p_review_request_id: created.data!.id,
      p_expected_updated_at: created.data!.updated_at,
      p_comment: '',
    })
    expect(denied.error).not.toBeNull()

    const rejected = await leader.rpc('reject_review_request', {
      p_review_request_id: created.data!.id,
      p_expected_updated_at: created.data!.updated_at,
      p_comment: '   ',
    })
    expect(rejected.error).toBeNull()

    const request = await leader
      .from('review_requests')
      .select('status,rejection_count')
      .eq('id', created.data!.id)
      .single()
    expect(request.error).toBeNull()
    expect(request.data).toMatchObject({ status: 'rejected', rejection_count: 1 })

    const feedback = await leader
      .from('review_feedback')
      .select('id', { count: 'exact', head: true })
      .eq('review_request_id', created.data!.id)
    expect(feedback.error).toBeNull()
    expect(feedback.count).toBe(0)

    const events = await leader
      .from('review_events')
      .select('event_type,metadata')
      .eq('review_request_id', created.data!.id)
      .eq('event_type', 'rejected')
    expect(events.error).toBeNull()
    expect(events.data).toEqual([
      expect.objectContaining({
        event_type: 'rejected',
        metadata: expect.objectContaining({ comment_provided: false }),
      }),
    ])

    const activity = await leader
      .from('activity_logs')
      .select('metadata')
      .eq('entity_type', 'review_request')
      .eq('entity_id', created.data!.id)
      .eq('action', 'status_changed')
      .single()
    expect(activity.error).toBeNull()
    expect(activity.data?.metadata).toMatchObject({ status: 'rejected', comment_provided: false })

    const audit = await leader.rpc('list_audit_events_v2', { p_limit: 100, p_before_id: null })
    expect(audit.error).toBeNull()
    expect(audit.data).toContainEqual(expect.objectContaining({
      entity_type: 'review_request',
      entity_id: created.data!.id,
      action: 'updated',
      reason: '댓글 없이 반려',
      source: 'reject_review_request',
    }))
  })
})
