import { createClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured, RLS_SKIP_NOTE } from './helpers'

const describeRls = isSupabaseRlsTargetConfigured() ? describe : describe.skip

function requiredEnv(name: string): string {
  const value = process.env[name]
  if (!value) expect.fail(`Set ${name}`)
  return value
}

// Contracts for get_review_bootstrap_v2, list_review_events_page, and get_review_statistics_v2.
describeRls(`RLS review query v2 (${RLS_SKIP_NOTE})`, () => {
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

  it('bounds get_review_bootstrap_v2 to only the caller relevant requests/events/receipts', async () => {
    const memberA = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberBRequestId = requiredEnv('RLS_MEMBER_B_REVIEW_REQUEST_ID')

    const result = await memberA.rpc('get_review_bootstrap_v2')
    expect(result.error).toBeNull()
    expect(result.data?.schema_version).toBe(2)
    expect(Array.isArray(result.data?.requests)).toBe(true)
    expect(result.data?.requests.some((request: { id: string }) => request.id === memberBRequestId)).toBe(false)
    // Bounded: never the full event ledger, at most one relevant event per visible request.
    const requestIds = new Set(result.data.requests.map((request: { id: string }) => request.id))
    const eventCountsByRequest = new Map<string, number>()
    for (const event of result.data.events) {
      eventCountsByRequest.set(
        event.review_request_id,
        (eventCountsByRequest.get(event.review_request_id) ?? 0) + 1,
      )
    }
    for (const count of eventCountsByRequest.values()) expect(count).toBe(1)
    for (const requestId of eventCountsByRequest.keys()) expect(requestIds.has(requestId)).toBe(true)
    // Receipts belong only to the caller.
    for (const receipt of result.data.read_receipts) {
      expect(receipt.user_id).toBe((await memberA.auth.getUser()).data.user?.id)
    }
  })

  it('denies list_review_events_page for a review the caller cannot see (member isolation)', async () => {
    const memberA = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const memberBRequestId = requiredEnv('RLS_MEMBER_B_REVIEW_REQUEST_ID')

    const result = await memberA.rpc('list_review_events_page', {
      p_review_request_id: memberBRequestId,
      p_before_id: null,
      p_limit: 50,
    })
    expect(result.error).not.toBeNull()
  })

  it('allows the leader to page a review history in DESC cursor order clamped to at most 100 rows', async () => {
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const requestId = requiredEnv('RLS_RESUBMIT_HISTORY_REVIEW_REQUEST_ID')

    const oversized = await leader.rpc('list_review_events_page', {
      p_review_request_id: requestId,
      p_before_id: null,
      p_limit: 500,
    })
    expect(oversized.error).toBeNull()
    expect(oversized.data.length).toBeLessThanOrEqual(100)
    const ids = oversized.data.map((event: { id: number }) => event.id)
    expect(ids).toEqual([...ids].sort((left, right) => right - left))

    if (ids.length > 1) {
      const secondPage = await leader.rpc('list_review_events_page', {
        p_review_request_id: requestId,
        p_before_id: ids[0],
        p_limit: 50,
      })
      expect(secondPage.error).toBeNull()
      expect(secondPage.data.every((event: { id: number }) => event.id < ids[0])).toBe(true)
    }
  })

  it('denies get_review_statistics_v2 for a member (leader-only)', async () => {
    const member = await authenticatedClient('RLS_MEMBER_A_EMAIL', 'RLS_MEMBER_A_PASSWORD')
    const result = await member.rpc('get_review_statistics_v2', {
      p_from: '2026-01-01',
      p_to: '2026-01-31',
      p_requester_id: null,
      p_status: null,
    })
    expect(result.error).not.toBeNull()
  })

  it('returns leader-only aggregate statistics without any raw event rows', async () => {
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const result = await leader.rpc('get_review_statistics_v2', {
      p_from: '2026-01-01',
      p_to: '2026-12-31',
      p_requester_id: null,
      p_status: null,
    })
    expect(result.error).toBeNull()
    expect(result.data.schema_version).toBe(2)
    expect(result.data.timezone).toBe('Asia/Seoul')
    expect(result.data).not.toHaveProperty('events')
    expect(result.data).not.toHaveProperty('requests')
    expect(typeof result.data.pending_count).toBe('number')
    expect(Array.isArray(result.data.requester_breakdown)).toBe(true)
    expect(result.data.requester_breakdown.reduce(
      (sum: number, row: { new_requests: number }) => sum + row.new_requests,
      0,
    )).toBe(result.data.new_requests)
    expect(result.data.requester_breakdown.reduce(
      (sum: number, row: { pending_count: number }) => sum + row.pending_count,
      0,
    )).toBe(result.data.pending_count)
    expect(Array.isArray(result.data.month_end_backlog)).toBe(true)
    for (const row of result.data.month_end_backlog) {
      expect(row).not.toHaveProperty('review_request_id')
      expect(row).not.toHaveProperty('metadata')
    }
  }, 15_000)

  it('bounds current pending by the selected request-created range', async () => {
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const result = await leader.rpc('get_review_statistics_v2', {
      p_from: '2020-01-01',
      p_to: '2020-01-31',
      p_requester_id: null,
      p_status: null,
    })

    expect(result.error).toBeNull()
    expect(result.data.pending_count).toBe(0)
    expect(result.data.requester_breakdown).toEqual([])
  })

  it('rejects an over-long statistics range and an anon caller for every review-query RPC', async () => {
    const leader = await authenticatedClient('RLS_LEADER_EMAIL', 'RLS_LEADER_PASSWORD')
    const overLong = await leader.rpc('get_review_statistics_v2', {
      p_from: '2020-01-01',
      p_to: '2026-12-31',
      p_requester_id: null,
      p_status: null,
    })
    expect(overLong.error).not.toBeNull()

    const anonymous = createClient(url, anonKey, { auth: { persistSession: false } })
    const bootstrap = await anonymous.rpc('get_review_bootstrap_v2')
    expect(bootstrap.error).not.toBeNull()
    const page = await anonymous.rpc('list_review_events_page', { p_review_request_id: null, p_before_id: null, p_limit: 10 })
    expect(page.error).not.toBeNull()
    const stats = await anonymous.rpc('get_review_statistics_v2', {
      p_from: '2026-01-01',
      p_to: '2026-01-31',
      p_requester_id: null,
      p_status: null,
    })
    expect(stats.error).not.toBeNull()
  })
})
