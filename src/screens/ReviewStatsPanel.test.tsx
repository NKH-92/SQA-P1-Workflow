import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reviewStatusLabels } from '../lib/format'
import type { AppData, ReviewEvent, ReviewRequest } from '../types'
import { ReviewStatsPanel } from './ReviewStatsPanel'

// Defaults to the local-preview parity builder (buildReviewStatisticsV2) instead of
// the real Supabase RPC, matching useReviewStatisticsV2.test.ts. Without this, a
// real `.env.local` Supabase project (if configured in this workspace) would make
// these UI tests issue live network requests. Individual tests can flip
// `mocks.hasSupabaseConfig`/`mocks.fetchReviewStatisticsV2` to exercise the
// remote-RPC-error path instead.
const mocks = vi.hoisted(() => ({
  hasSupabaseConfig: false,
  fetchReviewStatisticsV2: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  get hasSupabaseConfig() {
    return mocks.hasSupabaseConfig
  },
  supabase: null,
}))
vi.mock('../data', () => ({
  fetchReviewStatisticsV2: mocks.fetchReviewStatisticsV2,
}))

/**
 * The panel now loads its statistics from `useReviewStatisticsV2` inside a
 * `useEffect`, so every render/interaction that can trigger a new
 * fetch needs a microtask flush before assertions run.
 */
async function flushReviewStatsV2(): Promise<void> {
  await act(async () => {
    for (let tick = 0; tick < 10; tick += 1) {
      await Promise.resolve()
    }
  })
}

async function renderReviewStatsPanel(data: AppData) {
  render(<ReviewStatsPanel data={data} now={new Date('2026-07-15T03:00:00.000Z')} />)
  await flushReviewStatsV2()
}

async function changeAndFlush(element: HTMLElement, value: string): Promise<void> {
  fireEvent.change(element, { target: { value } })
  await flushReviewStatsV2()
}

async function clickAndFlush(element: HTMLElement): Promise<void> {
  fireEvent.click(element)
  await flushReviewStatsV2()
}

function emptyData(): AppData {
  return {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [],
    allowedUsers: [],
    products: [],
    dutyMajorCategories: [],
    duties: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
}

function request(overrides: Partial<ReviewRequest> & Pick<ReviewRequest, 'id' | 'requester_id' | 'status'>): ReviewRequest {
  return {
    title: overrides.id,
    description: '',
    due_date: null,
    created_at: new Date(2026, 5, 10, 12).toISOString(),
    review_round: 1,
    ...overrides,
  }
}

function withReviewEvents(data: AppData): AppData {
  let id = 0
  const reviewEvents: ReviewEvent[] = data.reviewRequests.flatMap((review) => {
    const submitted: ReviewEvent = {
      id: ++id, review_request_id: review.id, actor_id: review.requester_id,
      actor_name_snapshot: review.profiles?.name ?? '요청자', event_type: 'submitted',
      from_status: null, to_status: 'pending', occurred_at: review.created_at!, metadata: {}, transaction_id: id,
    }
    const events = [submitted]
    for (let round = 1; round < (review.review_round ?? 1); round += 1) {
      events.push({ ...submitted, id: ++id, event_type: 'resubmitted', from_status: 'rejected', transaction_id: id })
    }
    if (review.status === 'approved' || review.status === 'rejected') {
      events.push({ ...submitted, id: ++id, event_type: review.status, from_status: 'pending', to_status: review.status, transaction_id: id })
    }
    return events
  })
  return { ...data, reviewEvents }
}

function remoteEnvelope() {
  return {
    schema_version: 2 as const,
    timezone: 'Asia/Seoul' as const,
    generated_at: '2026-07-15T03:00:00.000Z',
    from: '2026-01-16',
    to: '2026-07-15',
    requester_id: null,
    status: null,
    new_requests: 0,
    resubmissions: 0,
    approvals: 0,
    rejections: 0,
    pending_count: 0,
    requester_breakdown: [],
    month_end_backlog: [],
    monthly_breakdown: [],
  }
}

describe('ReviewStatsPanel', () => {
  beforeEach(() => {
    mocks.hasSupabaseConfig = false
    mocks.fetchReviewStatisticsV2.mockReset()
  })

  afterEach(() => {
    cleanup()
  })

  it('starts with the recent six-month preset and exposes inclusive custom date bounds', async () => {
    await renderReviewStatsPanel(emptyData())

    expect(screen.getByRole('button', { name: '최근 6개월' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('article', { name: '요청 건수 0건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '제출 횟수 0회' })).toBeInTheDocument()
    expect(screen.queryByText(/담당자/)).not.toBeInTheDocument()

    const customButton = screen.getByRole('button', { name: '사용자 지정' })
    customButton.focus()
    await clickAndFlush(customButton)

    expect(customButton).toHaveFocus()
    expect(customButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('시작일')).toHaveAttribute('min', '2026-01-16')
    expect(screen.getByLabelText('종료일')).toHaveAttribute('max', '2026-07-15')
  })

  it('renders an accessible empty state without hiding the filters or producing invalid numbers', async () => {
    await renderReviewStatsPanel(emptyData())

    expect(screen.getByRole('heading', { name: '통계 필터' })).toBeInTheDocument()
    expect(screen.getByText('선택한 조건에 해당하는 검토 데이터가 없습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('요청자')).toBeInTheDocument()
    expect(screen.getByLabelText('현재 상태')).toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /월별 검토 추이 그래프/ })).not.toBeInTheDocument()
  })

  it('shows exact request and review_round totals in the requester table', async () => {
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [
      request({
        id: 'review-1',
        requester_id: 'member-1',
        status: 'approved',
        review_round: 3,
        created_at: new Date(2026, 5, 10, 12).toISOString(),
        profiles: { name: '한 요청자', email: 'one@example.com' },
      }),
      request({
        id: 'review-2',
        requester_id: 'member-1',
        status: 'pending',
        review_round: 1,
        created_at: new Date(2026, 6, 1, 12).toISOString(),
        profiles: { name: '한 요청자', email: 'one@example.com' },
      }),
    ]

    await renderReviewStatsPanel(withReviewEvents(data))

    expect(screen.getByRole('article', { name: '요청 건수 2건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '제출 횟수 4회' })).toBeInTheDocument()

    const table = screen.getByRole('table', {
      name: '요청·재제출·승인·반려는 서버 이벤트 발생 시각, 현재 대기는 선택 기간에 생성된 요청의 현재 상태를 기준으로 집계합니다.',
    })
    const requesterRow = within(table).getByRole('row', { name: /한 요청자/ })
    expect(within(requesterRow).getAllByRole('cell').map((cell: HTMLElement) => cell.textContent)).toEqual([
      '2',
      '4',
      '2',
      '1',
      '1',
      '0',
    ])
    expect(screen.getByRole('region', { name: /요청자별 검토 통계 표/ })).toHaveAttribute('tabindex', '0')
  })

  it('composes requester and status filters across KPIs, charts, and the exact table', async () => {
    const data = emptyData()
    data.profiles = [
      { id: 'member-1', email: 'one@example.com', name: '첫 요청자', role: 'member' },
      { id: 'member-2', email: 'two@example.com', name: '둘 요청자', role: 'member' },
    ]
    data.reviewRequests = [
      request({ id: 'one-approved', requester_id: 'member-1', status: 'approved', review_round: 2 }),
      request({ id: 'one-pending', requester_id: 'member-1', status: 'pending', review_round: 1 }),
      request({ id: 'two-approved', requester_id: 'member-2', status: 'approved', review_round: 4 }),
    ]

    await renderReviewStatsPanel(withReviewEvents(data))
    await changeAndFlush(screen.getByLabelText('요청자'), 'member-1')
    await changeAndFlush(screen.getByLabelText('현재 상태'), 'approved')

    expect(screen.getByRole('article', { name: '요청 건수 1건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '제출 횟수 2회' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '현재 검토 상태 분포' })).toHaveTextContent(
      new RegExp(`${reviewStatusLabels.approved}\\s*1건\\s*100%`),
    )

    const table = screen.getByRole('table')
    expect(within(table).getByRole('row', { name: /첫 요청자/ })).toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /둘 요청자/ })).not.toBeInTheDocument()
  })

  it('keeps inactive requesters identifiable in the filter, chart, and table', async () => {
    const data = emptyData()
    data.profiles = [
      {
        id: 'inactive-member',
        email: 'inactive@example.com',
        name: '퇴직 요청자',
        role: 'member',
        is_active: false,
      },
    ]
    data.reviewRequests = [
      request({
        id: 'inactive-review',
        requester_id: 'inactive-member',
        status: 'approved',
        profiles: { name: '퇴직 요청자', email: 'inactive@example.com' },
      }),
    ]

    await renderReviewStatsPanel(withReviewEvents(data))

    expect(screen.getByRole('option', { name: '퇴직 요청자 (비활성)' })).toBeInTheDocument()
    expect(screen.getAllByText('비활성').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('rowheader', { name: /퇴직 요청자\s*비활성/ })).toBeInTheDocument()
  })

  it('keeps an in-period approval visible when the request was created before the selected window', async () => {
    const data = emptyData()
    const historicalRequest = request({
      id: 'historical-approved',
      requester_id: 'removed-member',
      status: 'approved',
      review_round: 9,
      created_at: new Date(2025, 11, 1, 12).toISOString(),
      profiles: { name: '삭제된 이벤트 요청자', email: 'removed@example.com' },
    })
    data.reviewRequests = [historicalRequest]
    data.reviewEvents = [{
      id: 1,
      review_request_id: historicalRequest.id,
      actor_id: 'leader-1',
      actor_name_snapshot: '리더',
      event_type: 'approved',
      from_status: 'pending',
      to_status: 'approved',
      occurred_at: new Date(2026, 5, 10, 12).toISOString(),
      metadata: {},
      transaction_id: 1,
    }]

    await renderReviewStatsPanel(data)

    expect(screen.getByRole('article', { name: '요청 건수 0건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '승인 1건' })).toBeInTheDocument()
    expect(screen.queryByText('선택한 조건에 해당하는 검토 데이터가 없습니다.')).not.toBeInTheDocument()
    const requesterRow = screen.getByRole('row', { name: /알 수 없는 요청자\s*비활성/ })
    expect(within(requesterRow).getAllByRole('cell').map((cell: HTMLElement) => cell.textContent)).toEqual([
      '0',
      '0',
      '0',
      '0',
      '1',
      '0',
    ])
  })

  it('shows an empty state instead of zero-dividing charts when a valid filter combination has no rows', async () => {
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [request({ id: 'only-approved', requester_id: 'member-1', status: 'approved' })]

    await renderReviewStatsPanel(withReviewEvents(data))
    await changeAndFlush(screen.getByLabelText('현재 상태'), 'rejected')

    expect(screen.getByRole('article', { name: '요청 건수 0건' })).toBeInTheDocument()
    expect(screen.getByText('선택한 조건에 해당하는 검토 데이터가 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '현재 검토 상태 분포' })).not.toBeInTheDocument()
  })

  it('shows a loading state instead of zeros while the v2 statistics fetch is in flight', () => {
    render(<ReviewStatsPanel data={emptyData()} />)

    // Deliberately not flushed: the KPI grid must not render with misleading
    // zeros before the server aggregate actually resolves (fail closed).
    expect(screen.getByText('통계를 불러오는 중입니다.')).toBeInTheDocument()
    expect(screen.queryByRole('article', { name: /요청 건수/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('집계 중…')
  })

  it('shows an alert and hides the KPI grid when the server aggregate fails, instead of showing zeros', async () => {
    mocks.hasSupabaseConfig = true
    mocks.fetchReviewStatisticsV2.mockRejectedValue({ code: '42501', message: 'permission denied' })

    await renderReviewStatsPanel(emptyData())

    expect(screen.getByRole('alert')).toHaveTextContent('통계를 불러오지 못했습니다')
    expect(screen.getByRole('alert')).toHaveTextContent('권한이 없습니다.')
    expect(screen.queryByRole('article', { name: /요청 건수/ })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('집계 실패')
  })

  it('does not refetch remote statistics for an equivalent refreshed AppData snapshot', async () => {
    mocks.hasSupabaseConfig = true
    mocks.fetchReviewStatisticsV2.mockResolvedValue(remoteEnvelope())
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [
      request({ id: 'review-1', requester_id: 'member-1', status: 'pending' }),
      request({ id: 'review-2', requester_id: 'member-1', status: 'approved' }),
    ]
    data.reviewEvents = withReviewEvents(data).reviewEvents
    const now = new Date('2026-07-15T03:00:00.000Z')
    const { rerender } = render(<ReviewStatsPanel data={data} now={now} />)
    await flushReviewStatsV2()

    expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1)

    rerender(
      <ReviewStatsPanel
        data={{
          ...data,
          profiles: data.profiles.map((profile) => ({ ...profile })),
          reviewRequests: data.reviewRequests.map((review) => ({ ...review })).reverse(),
          reviewEvents: [...(data.reviewEvents ?? [])].reverse(),
        }}
        now={now}
      />,
    )
    await flushReviewStatsV2()

    expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1)
  })

  it('refetches remote statistics when a review request status changes', async () => {
    mocks.hasSupabaseConfig = true
    mocks.fetchReviewStatisticsV2.mockResolvedValue(remoteEnvelope())
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [request({ id: 'review-1', requester_id: 'member-1', status: 'pending' })]
    const now = new Date('2026-07-15T03:00:00.000Z')
    const { rerender } = render(<ReviewStatsPanel data={data} now={now} />)
    await flushReviewStatsV2()

    rerender(
      <ReviewStatsPanel
        data={{
          ...data,
          reviewRequests: data.reviewRequests.map((review) => ({ ...review, status: 'approved' })),
        }}
        now={now}
      />,
    )
    await flushReviewStatsV2()

    expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(2)
  })

  it('refetches remote statistics when a review event is added', async () => {
    mocks.hasSupabaseConfig = true
    mocks.fetchReviewStatisticsV2.mockResolvedValue(remoteEnvelope())
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [request({ id: 'review-1', requester_id: 'member-1', status: 'pending' })]
    data.reviewEvents = []
    const now = new Date('2026-07-15T03:00:00.000Z')
    const { rerender } = render(<ReviewStatsPanel data={data} now={now} />)
    await flushReviewStatsV2()

    rerender(
      <ReviewStatsPanel
        data={{
          ...data,
          reviewEvents: [{
            id: 1,
            review_request_id: 'review-1',
            actor_id: 'member-1',
            actor_name_snapshot: '한 요청자',
            event_type: 'submitted',
            from_status: null,
            to_status: 'pending',
            occurred_at: '2026-07-15T03:00:00.000Z',
            metadata: {},
            transaction_id: 1,
          }],
        }}
        now={now}
      />,
    )
    await flushReviewStatsV2()

    expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(2)
  })

  it('ignores an older response after a review change starts a new request', async () => {
    mocks.hasSupabaseConfig = true
    let resolveFirst: ((value: ReturnType<typeof remoteEnvelope>) => void) | undefined
    let resolveSecond: ((value: ReturnType<typeof remoteEnvelope>) => void) | undefined
    mocks.fetchReviewStatisticsV2
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve }))
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [request({ id: 'review-1', requester_id: 'member-1', status: 'pending' })]
    const now = new Date('2026-07-15T03:00:00.000Z')
    const { rerender } = render(<ReviewStatsPanel data={data} now={now} />)
    await flushReviewStatsV2()

    rerender(
      <ReviewStatsPanel
        data={{
          ...data,
          reviewRequests: data.reviewRequests.map((review) => ({ ...review, status: 'approved' })),
        }}
        now={now}
      />,
    )
    await flushReviewStatsV2()
    expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(2)

    const newest = { ...remoteEnvelope(), new_requests: 2 }
    await act(async () => resolveSecond?.(newest))
    await flushReviewStatsV2()
    expect(screen.getByRole('article', { name: '요청 건수 2건' })).toBeInTheDocument()

    await act(async () => resolveFirst?.({ ...remoteEnvelope(), new_requests: 1 }))
    await flushReviewStatsV2()
    expect(screen.getByRole('article', { name: '요청 건수 2건' })).toBeInTheDocument()
  })

  it('does not refetch remote statistics when unrelated AppData changes', async () => {
    mocks.hasSupabaseConfig = true
    mocks.fetchReviewStatisticsV2.mockResolvedValue(remoteEnvelope())
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [request({ id: 'review-1', requester_id: 'member-1', status: 'pending' })]
    const now = new Date('2026-07-15T03:00:00.000Z')
    const { rerender } = render(<ReviewStatsPanel data={data} now={now} />)
    await flushReviewStatsV2()

    rerender(
      <ReviewStatsPanel
        data={{
          ...data,
          announcements: [{
            id: 'announcement-1',
            title: '공지',
            body: '통계와 무관한 변경',
            is_pinned: false,
            pinned_at: null,
            created_by: 'leader-1',
            created_at: '2026-07-15T03:00:00.000Z',
            updated_at: '2026-07-15T03:00:00.000Z',
          }],
          projects: [{
            id: 'project-1',
            name: '프로젝트',
            description: '통계와 무관한 변경',
            deadline: null,
            status: 'in_progress',
            created_by: 'leader-1',
          }],
        }}
        now={now}
      />,
    )
    await flushReviewStatsV2()

    expect(mocks.fetchReviewStatisticsV2).toHaveBeenCalledTimes(1)
  })
})
