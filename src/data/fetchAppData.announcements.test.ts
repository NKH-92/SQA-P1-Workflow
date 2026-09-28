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
    application_summaries: [],
  }
}

function defaultRpcResult(name: string): { data: unknown; error: unknown } {
  if (name === 'get_core_bootstrap_v2') {
    return {
      data: { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyCoreBootstrapData(), warnings: [] },
      error: null,
    }
  }
  if (name === 'get_change_bootstrap_v3') {
    return {
      data: { schema_version: 3, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyChangeBootstrapData(), warnings: [] },
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

const REQUIRED_BOOTSTRAP_TRACE = [
  'rpc:get_core_bootstrap_v2',
  'rpc:get_review_bootstrap_v2',
  'rpc:get_change_bootstrap_v3',
]
const OPTIONAL_QUERY_TRACE = [
  'from:allowed_users',
  'from:profile_notes',
  'from:activity_logs',
  'from:announcements',
  'rpc:get_office_seats',
  'rpc:get_section_read_marks',
  'rpc:get_office_meeting',
  'rpc:get_member_presence',
]

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
    for (const name of ['get_core_bootstrap_v2', 'get_change_bootstrap_v3', 'get_review_bootstrap_v2']) {
      mocks.rpcResults[name] = defaultRpcResult(name)
    }
    mocks.rpcResults.get_office_seats = { data: { revision: 'office-r1', seats: [] }, error: null }
    mocks.rpcResults.get_section_read_marks = { data: [], error: null }
    mocks.rpcResults.get_office_meeting = { data: null, error: null }
    mocks.rpcResults.get_member_presence = { data: { statuses: [], leaves: [] }, error: null }
  })

  it('reports the first required-bootstrap error even though optional queries already started', async () => {
    const firstError = { message: 'core bootstrap unavailable' }
    mocks.rpcResults.get_core_bootstrap_v2 = { data: null, error: firstError }

    await expect(fetchAppData()).rejects.toBe(firstError)

    expect(mocks.trace).toEqual([...OPTIONAL_QUERY_TRACE, ...REQUIRED_BOOTSTRAP_TRACE])
  })

  it('starts optional queries together with the three required bootstraps instead of after them', async () => {
    await fetchAppData()

    expect(mocks.trace).toEqual([...OPTIONAL_QUERY_TRACE, ...REQUIRED_BOOTSTRAP_TRACE])
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
    mocks.rpcResults.get_change_bootstrap_v3 = {
      data: { schema_version: 3, snapshot_at: '2026-07-20T00:00:01.000Z', data: emptyChangeBootstrapData(), warnings: [] },
      error: null,
    }

    const result = await fetchAppData()

    expect(result.snapshotAt).toBe('2026-07-20T00:00:00.500Z')
  })

  it('forwards server overflow warnings to the user-visible optional warning channel', async () => {
    const warning = '[SQA_CHANGE_APPLICATIONS_TRUNCATED] 최신 1,000건만 불러왔습니다.'
    mocks.rpcResults.get_change_bootstrap_v3 = {
      data: {
        schema_version: 3,
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
    mocks.rpcResults.get_change_bootstrap_v3 = { data: null, error: null }

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
      '공지: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
      '계정 목록: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
      '관리 메모: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
      '활동 로그: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
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
      '공지: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
      '계정 목록: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
      '관리 메모: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
      '활동 로그: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.',
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
    expect(result.optionalWarnings).toContain('공지: 최근 200건까지만 보여요.')
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
    expect(result.optionalWarnings).not.toContain('활동 로그: 최근 100건까지만 보여요.')
    expect(result.optionalWarnings).toEqual([])
  })

  it('treats announcement query failure as an optional warning', async () => {
    mocks.results.announcements = { data: null, error: { message: 'announcements unavailable' } }

    const result = await fetchAppData()

    expect(result.announcements).toEqual([])
    expect(result.optionalWarnings).toHaveLength(1)
  })

  it('loads the shared office layout from its RPC envelope', async () => {
    mocks.rpcResults.get_office_seats = {
      data: {
        revision: 'office-r2',
        seats: [{ seat_index: 3, profile_id: 'member-1', name: '파트원', gender: 'female', style_seed: 12 }],
      },
      error: null,
    }

    const result = await fetchAppData()

    expect(result.officeLayout).toEqual({
      revision: 'office-r2',
      seats: [{ seat_index: 3, profile_id: 'member-1', name: '파트원', gender: 'female', style_seed: 12 }],
    })
    expect(result.optionalWarnings).toEqual([])
  })

  it('keeps the previous office layout and warns when the office RPC fails or answers malformed data', async () => {
    const previous = {
      ...previousWithLeader({ id: 'leader-1', name: 'Leader' }),
      officeLayout: {
        revision: 'office-r1',
        seats: [{ seat_index: 1, profile_id: 'leader-1', name: 'Leader', gender: 'male' as const, style_seed: 1 }],
      },
    }
    for (const failure of [
      { data: null, error: { message: 'office unavailable' } },
      { data: { seats: [] }, error: null },
    ]) {
      mocks.rpcResults.get_office_seats = failure
      const result = await fetchAppData(previous)
      expect(result.officeLayout).toEqual(previous.officeLayout)
      expect(result.optionalWarnings).toContain('사무실 자리: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.')
    }
  })

  it('loads my section read marks for the office alerts', async () => {
    const mark = {
      user_id: 'member-1',
      section: 'announcements',
      seen_keys: ['00000000-0000-4000-8000-000000000001'],
      seen_at: '2026-09-27T01:00:00.000Z',
    }
    mocks.rpcResults.get_section_read_marks = { data: [mark], error: null }

    const result = await fetchAppData()

    expect(result.sectionReadMarks).toEqual([mark])
    expect(result.optionalWarnings).toEqual([])
  })

  it('keeps the previous read marks, or leaves them unknown, when the read-mark RPC fails or answers malformed data', async () => {
    const previousMarks = [{
      user_id: 'leader-1',
      section: 'projects' as const,
      seen_keys: [],
      seen_at: '2026-09-27T01:00:00.000Z',
    }]
    const previous = { ...previousWithLeader({ id: 'leader-1', name: 'Leader' }), sectionReadMarks: previousMarks }
    for (const failure of [
      { data: null, error: { message: 'read marks unavailable' } },
      { data: [{ section: 'unknown', seen_keys: [] }], error: null },
    ]) {
      mocks.rpcResults.get_section_read_marks = failure
      const kept = await fetchAppData(previous)
      expect(kept.sectionReadMarks).toEqual(previousMarks)
      expect(kept.optionalWarnings).toContain('새 소식 표시: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.')

      // 이전 기록도 없으면 모르는 상태로 둬 ‘새 소식’을 잘못 띄우지 않는다.
      const unknown = await fetchAppData()
      expect(unknown.sectionReadMarks).toBeUndefined()
    }
  })

  it('loads the open office meeting, or none', async () => {
    const meeting = {
      id: 'meeting-1',
      title: '일탈 건 5분 논의',
      organizer_id: 'member-1',
      organizer_name: '파트원',
      created_at: '2026-09-27T01:00:00.000Z',
      starts_at: '2026-09-27T01:00:00.000Z',
      location: '',
      expires_at: '2026-09-27T04:00:00.000Z',
      participants: [
        { user_id: 'member-1', name: '파트원', acknowledged_at: '2026-09-27T01:00:00.000Z' },
        { user_id: 'member-2', name: '동료', acknowledged_at: null },
      ],
    }
    mocks.rpcResults.get_office_meeting = { data: meeting, error: null }
    expect((await fetchAppData()).officeMeeting).toEqual(meeting)

    mocks.rpcResults.get_office_meeting = { data: null, error: null }
    const none = await fetchAppData()
    expect(none.officeMeeting).toBeNull()
    expect(none.optionalWarnings).toEqual([])
  })

  it('keeps the previous meeting state and warns when the meeting RPC fails or answers malformed data', async () => {
    const previous = { ...previousWithLeader({ id: 'leader-1', name: 'Leader' }), officeMeeting: null }
    for (const failure of [
      { data: null, error: { message: 'meeting unavailable' } },
      { data: { id: 'meeting-1' }, error: null },
    ]) {
      mocks.rpcResults.get_office_meeting = failure
      const result = await fetchAppData(previous)
      expect(result.officeMeeting).toBeNull()
      expect(result.optionalWarnings).toContain('사무실 회의: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.')
      expect((await fetchAppData()).officeMeeting).toBeUndefined()
    }
  })

  it('loads everyone’s presence and keeps the previous presence when it fails', async () => {
    const presence = {
      statuses: [{ profile_id: 'member-1', name: '파트원', status: 'lab', updated_at: '2026-09-27T01:00:00.000Z' }],
      leaves: [{ id: 'leave-1', profile_id: 'member-2', name: '동료', kind: 'trip', starts_on: '2026-09-27', ends_on: '2026-09-29', note: '오송' }],
    }
    mocks.rpcResults.get_member_presence = { data: presence, error: null }
    const loaded = await fetchAppData()
    expect(loaded.memberPresence).toEqual(presence)
    expect(loaded.optionalWarnings).toEqual([])

    for (const failure of [
      { data: null, error: { message: 'presence unavailable' } },
      { data: { statuses: [{ profile_id: 'x' }], leaves: [] }, error: null },
    ]) {
      mocks.rpcResults.get_member_presence = failure
      const result = await fetchAppData(loaded)
      expect(result.memberPresence).toEqual(presence)
      expect(result.optionalWarnings).toContain('자리 상태: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.')
    }
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
