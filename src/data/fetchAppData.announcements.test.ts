import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Announcement, Profile, ReviewRequest } from '../types'

const mocks = vi.hoisted(() => {
  const results: Record<string, { data: unknown[] | null; error: unknown }> = {}
  const rpcResults: Record<string, { data: unknown[] | null; error: unknown }> = {}
  const trace: string[] = []
  const queries: Record<string, {
    select: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
  }> = {}
  const from = vi.fn((table: string) => {
    trace.push(`from:${table}`)
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      or: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
      then: (
        resolve: (value: { data: unknown[] | null; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(results[table] ?? { data: [], error: null }).then(resolve, reject),
    }
    query.select.mockReturnValue(query)
    query.order.mockReturnValue(query)
    query.or.mockReturnValue(query)
    query.in.mockReturnValue(query)
    query.limit.mockReturnValue(query)
    queries[table] = query
    return query
  })
  const rpc = vi.fn((name: string) => {
    trace.push(`rpc:${name}`)
    return Promise.resolve(rpcResults[name] ?? { data: [], error: null })
  })
  return { results, rpcResults, queries, trace, from, rpc }
})

vi.mock('../lib/supabase', () => ({
  supabase: { from: mocks.from, rpc: mocks.rpc },
}))

import { fetchAppData, fetchProductChangeTaskHistory, mergeReviewRequests } from './fetchAppData'

const announcement: Announcement = {
  id: 'announcement-1',
  title: 'Pinned',
  body: 'Body',
  is_pinned: true,
  pinned_at: '2026-07-16T01:00:00.000Z',
  created_by: 'leader-1',
  created_at: '2026-07-16T00:00:00.000Z',
  updated_at: '2026-07-16T01:00:00.000Z',
}

describe('fetchAppData orchestration and optional data', () => {
  beforeEach(() => {
    mocks.from.mockClear()
    mocks.rpc.mockClear()
    mocks.trace.length = 0
    Object.keys(mocks.results).forEach((key) => delete mocks.results[key])
    Object.keys(mocks.rpcResults).forEach((key) => delete mocks.rpcResults[key])
    Object.keys(mocks.queries).forEach((key) => delete mocks.queries[key])
  })

  it('reports the first core-array error and never creates optional queries after core failure', async () => {
    const firstError = { message: 'products unavailable' }
    mocks.results.products = { data: null, error: firstError }
    mocks.results.change_action_items = { data: null, error: { message: 'actions unavailable' } }
    mocks.rpcResults.list_change_application_product_scope = {
      data: null,
      error: { message: 'scope unavailable' },
    }

    await expect(fetchAppData()).rejects.toBe(firstError)

    expect(mocks.trace).toEqual([
      'from:profiles',
      'from:products',
      'from:duty_major_categories',
      'from:duties',
      'from:product_assignments',
      'from:duty_assignments',
      'from:review_requests',
      'from:projects',
      'from:project_assignments',
      'from:change_applications',
      'from:change_action_items',
      'from:product_change_tasks',
      'rpc:list_change_application_product_scope',
      'rpc:list_change_application_assignees',
    ])
  })

  it('creates optional queries only after the successful 14-query core array', async () => {
    await fetchAppData()

    expect(mocks.trace).toEqual([
      'from:profiles',
      'from:products',
      'from:duty_major_categories',
      'from:duties',
      'from:product_assignments',
      'from:duty_assignments',
      'from:review_requests',
      'from:projects',
      'from:project_assignments',
      'from:change_applications',
      'from:change_action_items',
      'from:product_change_tasks',
      'rpc:list_change_application_product_scope',
      'rpc:list_change_application_assignees',
      'from:allowed_users',
      'from:profile_notes',
      'from:activity_logs',
      'from:public_leader_profiles',
      'from:announcements',
    ])
  })

  it('preserves optional warning order independently of optional query order', async () => {
    for (const table of [
      'allowed_users',
      'profile_notes',
      'activity_logs',
      'public_leader_profiles',
      'announcements',
    ]) {
      mocks.results[table] = { data: null, error: { message: `${table} unavailable` } }
    }

    const result = await fetchAppData()

    expect(result.optionalWarnings).toEqual([
      '파트장 프로필 조회에 실패했습니다.',
      '공지 조회에 실패했습니다.',
      '초대 목록 조회에 실패했습니다.',
      '프로필 메모 조회에 실패했습니다.',
      '활동 로그 조회에 실패했습니다.',
    ])
  })

  it('normalizes the single review result through mergeReviewRequests(result, null)', async () => {
    const reviews = [
      {
        id: 'review-1',
        status: 'rejected',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-01T01:00:00.000Z',
        review_feedback: [{ id: 'feedback-old', created_at: '2026-07-01T00:30:00.000Z' }],
      },
      {
        id: 'review-1',
        status: 'pending',
        created_at: '2026-07-01T00:00:00.000Z',
        updated_at: '2026-07-02T01:00:00.000Z',
        review_feedback: [{ id: 'feedback-new', created_at: '2026-07-02T00:30:00.000Z' }],
      },
    ] as ReviewRequest[]
    mocks.results.review_requests = { data: reviews, error: null }

    const result = await fetchAppData()

    expect(result.reviewRequests).toEqual(mergeReviewRequests(reviews, null))
    expect(result.reviewRequests).toHaveLength(1)
    expect(result.reviewRequests[0]).toMatchObject({ id: 'review-1', status: 'pending' })
  })

  it('keeps core profiles and appends only leader profiles missing from the core set', async () => {
    const existing = {
      id: 'leader-existing',
      name: 'Existing leader',
      email: 'existing@example.com',
      role: 'leader',
      is_active: true,
    } as Profile
    mocks.results.profiles = { data: [existing], error: null }
    mocks.results.public_leader_profiles = {
      data: [
        { id: existing.id, name: 'Duplicate leader view' },
        { id: 'leader-missing', name: 'Missing leader' },
      ],
      error: null,
    }

    const result = await fetchAppData()

    expect(result.profiles).toEqual([
      existing,
      {
        id: 'leader-missing',
        name: 'Missing leader',
        email: '',
        role: 'leader',
        is_active: true,
      },
    ])
  })

  it('loads up to 200 announcements in board order', async () => {
    mocks.results.announcements = { data: [announcement], error: null }

    const result = await fetchAppData()

    expect(result.announcements).toEqual([announcement])
    expect(mocks.queries.announcements?.order.mock.calls).toEqual([
      ['is_pinned', { ascending: false }],
      ['pinned_at', { ascending: false, nullsFirst: false }],
      ['created_at', { ascending: false }],
      ['id', { ascending: false }],
    ])
    expect(mocks.queries.announcements?.limit).toHaveBeenCalledWith(200)
  })

  it('treats announcement query failure as an optional warning', async () => {
    mocks.results.announcements = { data: null, error: { message: 'announcements unavailable' } }

    const result = await fetchAppData()

    expect(result.announcements).toEqual([])
    expect(result.optionalWarnings).toHaveLength(1)
  })

  it('loads a selected change task history on demand without duplicate action ids', async () => {
    mocks.results.product_change_tasks = { data: [{ id: 'old-task' }], error: null }

    const result = await fetchProductChangeTaskHistory([
      'action-2',
      'action-1',
      'action-2',
      'action-3',
      'action-1',
    ])

    expect(result).toEqual([{ id: 'old-task' }])
    expect(mocks.queries.product_change_tasks?.in).toHaveBeenCalledWith(
      'action_item_id',
      ['action-2', 'action-1', 'action-3'],
    )
    expect(mocks.queries.product_change_tasks?.order).toHaveBeenCalledWith(
      'updated_at',
      { ascending: false },
    )
  })
})
