import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssembledAppData } from './fetch/assembleAppData'
import { createEmptyAppData } from './appData'
import type { Announcement, Profile, ReviewRequest } from '../types'

function previousWithLeader(leader: Pick<Profile, 'id' | 'name'>): AssembledAppData {
  return {
    ...createEmptyAppData(),
    profiles: [
      {
        id: leader.id,
        name: leader.name,
        email: '',
        role: 'leader',
        is_active: true,
      } as Profile,
    ],
    optionalWarnings: [],
  }
}

function emptyCoreBootstrapData() {
  return {
    profiles: [],
    leader_profiles: [],
    products: [],
    duty_major_categories: [],
    duties: [],
    product_assignments: [],
    duty_assignments: [],
    projects: [],
    project_assignments: [],
  }
}

function emptyChangeBootstrapData() {
  return {
    change_applications: [],
    change_action_items: [],
    product_change_tasks: [],
    change_product_scope: [],
    change_assignee_options: [],
  }
}

function defaultRpcResult(name: string): { data: unknown; error: unknown } {
  if (name === 'get_core_bootstrap_v2') {
    return {
      data: { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyCoreBootstrapData(), warnings: [] },
      error: null,
    }
  }
  if (name === 'get_change_bootstrap_v2') {
    return {
      data: { schema_version: 1, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyChangeBootstrapData(), warnings: [] },
      error: null,
    }
  }
  if (name === 'get_review_bootstrap_v2') {
    return {
      data: { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', requests: [], events: [], read_receipts: [], unread_count: 0 },
      error: null,
    }
  }
  return { data: [], error: null }
}

const mocks = vi.hoisted(() => {
  const results: Record<string, { data: unknown[] | null; error: unknown }> = {}
  const rpcResults: Record<string, { data: unknown; error: unknown }> = {}
  const trace: string[] = []
  const queries: Record<string, {
    select: ReturnType<typeof vi.fn>
    order: ReturnType<typeof vi.fn>
    or: ReturnType<typeof vi.fn>
    in: ReturnType<typeof vi.fn>
    limit: ReturnType<typeof vi.fn>
    range: ReturnType<typeof vi.fn>
  }> = {}
  const from = vi.fn((table: string) => {
    trace.push(`from:${table}`)
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      or: vi.fn(),
      in: vi.fn(),
      limit: vi.fn(),
      range: vi.fn(),
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
    query.range.mockReturnValue(query)
    queries[table] = query
    return query
  })
  const rpc = vi.fn((name: string) => {
    trace.push(`rpc:${name}`)
    const query = {
      then: (
        resolve: (value: { data: unknown; error: unknown }) => unknown,
        reject?: (reason: unknown) => unknown,
      ) => Promise.resolve(rpcResults[name]).then(resolve, reject),
    }
    return query
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
    for (const name of ['get_core_bootstrap_v2', 'get_change_bootstrap_v2', 'get_review_bootstrap_v2']) {
      mocks.rpcResults[name] = defaultRpcResult(name)
    }
  })

  it('reports the first required-bootstrap error and never creates optional queries after it', async () => {
    const firstError = { message: 'core bootstrap unavailable' }
    mocks.rpcResults.get_core_bootstrap_v2 = { data: null, error: firstError }

    await expect(fetchAppData()).rejects.toBe(firstError)

    expect(mocks.trace).toEqual([
      'rpc:get_core_bootstrap_v2',
      'rpc:get_review_bootstrap_v2',
      'rpc:get_change_bootstrap_v2',
    ])
  })

  it('creates optional queries only after the three required bootstraps succeed', async () => {
    await fetchAppData()

    expect(mocks.trace).toEqual([
      'rpc:get_core_bootstrap_v2',
      'rpc:get_review_bootstrap_v2',
      'rpc:get_change_bootstrap_v2',
      'from:allowed_users',
      'from:profile_notes',
      'from:activity_logs',
      'from:announcements',
    ])
  })

  it('exposes the earliest of the three bootstrap snapshot_at values as evidence for lastSyncedAt', async () => {
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: { schema_version: 2, snapshot_at: '2026-07-20T00:00:02.000Z', data: emptyCoreBootstrapData(), warnings: [] },
      error: null,
    }
    mocks.rpcResults.get_review_bootstrap_v2 = {
      data: { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.500Z', requests: [], events: [], read_receipts: [], unread_count: 0 },
      error: null,
    }
    mocks.rpcResults.get_change_bootstrap_v2 = {
      data: { schema_version: 1, snapshot_at: '2026-07-20T00:00:01.000Z', data: emptyChangeBootstrapData(), warnings: [] },
      error: null,
    }

    const result = await fetchAppData()

    expect(result.snapshotAt).toBe('2026-07-20T00:00:00.500Z')
  })

  it('forwards server overflow warnings to the user-visible optional warning channel', async () => {
    const warning = '[SQA_CHANGE_APPLICATIONS_TRUNCATED] 최신 1,000건만 불러왔습니다.'
    mocks.rpcResults.get_change_bootstrap_v2 = {
      data: {
        schema_version: 1,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: emptyChangeBootstrapData(),
        warnings: [warning],
      },
      error: null,
    }

    const result = await fetchAppData()

    expect(result.optionalWarnings[0]).toBe(warning)
  })

  it('fails closed on a core bootstrap schema_version mismatch instead of assembling a partial snapshot', async () => {
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: { schema_version: 99, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyCoreBootstrapData(), warnings: [] },
      error: null,
    }

    await expect(fetchAppData()).rejects.toThrow('schema_version mismatch')
  })

  it('fails closed on a null required envelope even when PostgREST reports no error', async () => {
    mocks.rpcResults.get_core_bootstrap_v2 = { data: null, error: null }
    mocks.rpcResults.get_change_bootstrap_v2 = { data: null, error: null }

    await expect(fetchAppData()).rejects.toThrow('null envelope')
  })

  it('preserves optional warning order independently of optional query order', async () => {
    for (const table of [
      'allowed_users',
      'profile_notes',
      'activity_logs',
      'announcements',
    ]) {
      mocks.results[table] = { data: null, error: { message: `${table} unavailable` } }
    }

    const result = await fetchAppData()

    expect(result.optionalWarnings).toEqual([
      '공지 조회에 실패해 마지막 정상 데이터를 유지합니다.',
      '초대 목록 조회에 실패해 마지막 정상 데이터를 유지합니다.',
      '프로필 메모 조회에 실패해 마지막 정상 데이터를 유지합니다.',
      '활동 로그 조회에 실패해 마지막 정상 데이터를 유지합니다.',
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
    mocks.rpcResults.get_review_bootstrap_v2 = {
      data: { requests: reviews, events: [], read_receipts: [], unread_count: 0, schema_version: 2, snapshot_at: '2026-07-02T01:00:00.000Z' },
      error: null,
    }

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
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: {
        schema_version: 2,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: {
          ...emptyCoreBootstrapData(),
          profiles: [existing],
          leader_profiles: [
            { id: existing.id, name: existing.name },
            { id: 'leader-missing', name: 'Missing leader' },
          ],
        },
        warnings: [],
      },
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

  it('uses the authoritative current leader snapshot instead of a previous optional snapshot', async () => {
    const previous = previousWithLeader({ id: 'leader-stale', name: 'Stale Leader' })
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: {
        schema_version: 2,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: { ...emptyCoreBootstrapData(), leader_profiles: [{ id: 'leader-stale', name: 'Current Leader' }] },
        warnings: [],
      },
      error: null,
    }
    const result = await fetchAppData(previous)

    expect(result.profiles).toEqual([
      {
        id: 'leader-stale',
        name: 'Current Leader',
        email: '',
        role: 'leader',
        is_active: true,
      },
    ])
    expect(result.optionalWarnings).toEqual([])
  })

  it('prefers required profiles over the previous leader snapshot when both describe the same id', async () => {
    const previous = previousWithLeader({ id: 'leader-1', name: 'Old Name' })
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: {
        schema_version: 2,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: {
          ...emptyCoreBootstrapData(),
          profiles: [
            { id: 'leader-1', name: 'Current Name', email: 'leader-1@example.com', role: 'leader', is_active: true },
          ],
          leader_profiles: [{ id: 'leader-1', name: 'Current Name' }],
        },
        warnings: [],
      },
      error: null,
    }
    const result = await fetchAppData(previous)

    expect(result.profiles).toEqual([
      { id: 'leader-1', name: 'Current Name', email: 'leader-1@example.com', role: 'leader', is_active: true },
    ])
  })

  it('does not resurrect a leader that the authoritative required query now shows as demoted or inactive', async () => {
    const previous = previousWithLeader({ id: 'leader-1', name: 'Former Leader' })
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: {
        schema_version: 2,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: {
          ...emptyCoreBootstrapData(),
          profiles: [
            { id: 'leader-1', name: 'Former Leader', email: 'former@example.com', role: 'member', is_active: true },
          ],
        },
        warnings: [],
      },
      error: null,
    }
    const result = await fetchAppData(previous)

    expect(result.profiles).toEqual([
      { id: 'leader-1', name: 'Former Leader', email: 'former@example.com', role: 'member', is_active: true },
    ])
  })

  it('does not resurrect a demoted leader for a member whose required profile list only contains themselves', async () => {
    const previous = previousWithLeader({ id: 'leader-1', name: 'Former Leader' })
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: {
        schema_version: 2,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: {
          ...emptyCoreBootstrapData(),
          profiles: [
            { id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member', is_active: true },
          ],
          leader_profiles: [],
        },
        warnings: [],
      },
      error: null,
    }
    const result = await fetchAppData(previous)

    expect(result.profiles).toEqual([
      { id: 'member-1', name: 'Member', email: 'member@example.com', role: 'member', is_active: true },
    ])
  })

  it('preserves optional warning order when a previous leader snapshot exists alongside other optional failures', async () => {
    const previous = previousWithLeader({ id: 'leader-stale', name: 'Stale Leader' })
    mocks.rpcResults.get_core_bootstrap_v2 = {
      data: {
        schema_version: 2,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: { ...emptyCoreBootstrapData(), leader_profiles: [{ id: 'leader-stale', name: 'Current Leader' }] },
        warnings: [],
      },
      error: null,
    }
    for (const table of [
      'allowed_users',
      'profile_notes',
      'activity_logs',
      'announcements',
    ]) {
      mocks.results[table] = { data: null, error: { message: `${table} unavailable` } }
    }

    const result = await fetchAppData(previous)

    expect(result.optionalWarnings).toEqual([
      '공지 조회에 실패해 마지막 정상 데이터를 유지합니다.',
      '초대 목록 조회에 실패해 마지막 정상 데이터를 유지합니다.',
      '프로필 메모 조회에 실패해 마지막 정상 데이터를 유지합니다.',
      '활동 로그 조회에 실패해 마지막 정상 데이터를 유지합니다.',
    ])
    expect(result.profiles).toEqual([
      {
        id: 'leader-stale',
        name: 'Current Leader',
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
    expect(mocks.queries.announcements?.limit).toHaveBeenCalledWith(201)
  })

  it('returns the 200-row announcement cap and warns when the sentinel row proves truncation', async () => {
    mocks.results.announcements = {
      data: Array.from({ length: 201 }, (_, index) => ({ ...announcement, id: `announcement-${index}` })),
      error: null,
    }

    const result = await fetchAppData()

    expect(result.announcements).toHaveLength(200)
    expect(result.optionalWarnings).toContain('공지: 최신 200건만 표시합니다.')
  })

  it('keeps the recent-100 activity cap informational instead of reporting stale data', async () => {
    mocks.results.activity_logs = {
      data: Array.from({ length: 101 }, (_, index) => ({
        id: `activity-${index}`,
        created_at: `2026-07-28T00:${String(index % 60).padStart(2, '0')}:00.000Z`,
      })),
      error: null,
    }

    const result = await fetchAppData()

    expect(mocks.queries.activity_logs?.limit).toHaveBeenCalledWith(101)
    expect(result.activityLogs).toHaveLength(100)
    expect(result.optionalWarnings).not.toContain('활동 로그: 최신 100건만 표시합니다.')
    expect(result.optionalWarnings).toEqual([])
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
