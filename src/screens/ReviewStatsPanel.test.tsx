import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { reviewStatusLabels } from '../lib/format'
import type { AppData, ReviewRequest } from '../types'
import { ReviewStatsPanel } from './ReviewStatsPanel'

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
    attachment_url: null,
    due_date: null,
    created_at: new Date(2026, 5, 10, 12).toISOString(),
    review_round: 1,
    ...overrides,
  }
}

describe('ReviewStatsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 6, 15, 12))
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it('starts with the recent six-month preset and exposes inclusive custom date bounds', () => {
    render(<ReviewStatsPanel data={emptyData()} />)

    expect(screen.getByRole('button', { name: '최근 6개월' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('article', { name: '요청 건수 0건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '제출 횟수 0회' })).toBeInTheDocument()
    expect(screen.queryByText(/담당자/)).not.toBeInTheDocument()

    const customButton = screen.getByRole('button', { name: '사용자 지정' })
    customButton.focus()
    fireEvent.click(customButton)

    expect(customButton).toHaveFocus()
    expect(customButton).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('시작일')).toHaveAttribute('min', '2026-01-16')
    expect(screen.getByLabelText('종료일')).toHaveAttribute('max', '2026-07-15')
  })

  it('renders an accessible empty state without hiding the filters or producing invalid numbers', () => {
    render(<ReviewStatsPanel data={emptyData()} />)

    expect(screen.getByRole('heading', { name: '통계 필터' })).toBeInTheDocument()
    expect(screen.getByText('선택한 조건에 해당하는 검토 데이터가 없습니다.')).toBeInTheDocument()
    expect(screen.getByLabelText('요청자')).toBeInTheDocument()
    expect(screen.getByLabelText('상태')).toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /월별 검토 추이 그래프/ })).not.toBeInTheDocument()
  })

  it('shows exact request and review_round totals in the requester table', () => {
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

    render(<ReviewStatsPanel data={data} />)

    expect(screen.getByRole('article', { name: '요청 건수 2건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '제출 횟수 4회' })).toBeInTheDocument()

    const table = screen.getByRole('table', {
      name: '요청 건수는 행 수, 제출 횟수는 각 행의 review_round 합계이며 값이 없거나 유효하지 않으면 1회로 계산합니다.',
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

  it('composes requester and status filters across KPIs, charts, and the exact table', () => {
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

    render(<ReviewStatsPanel data={data} />)
    fireEvent.change(screen.getByLabelText('요청자'), { target: { value: 'member-1' } })
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'approved' } })

    expect(screen.getByRole('article', { name: '요청 건수 1건' })).toBeInTheDocument()
    expect(screen.getByRole('article', { name: '제출 횟수 2회' })).toBeInTheDocument()
    expect(screen.getByRole('list', { name: '검토 상태 분포' })).toHaveTextContent(
      new RegExp(`${reviewStatusLabels.approved}\\s*1건\\s*100%`),
    )

    const table = screen.getByRole('table')
    expect(within(table).getByRole('row', { name: /첫 요청자/ })).toBeInTheDocument()
    expect(within(table).queryByRole('row', { name: /둘 요청자/ })).not.toBeInTheDocument()
  })

  it('keeps inactive requesters identifiable in the filter, chart, and table', () => {
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

    render(<ReviewStatsPanel data={data} />)

    expect(screen.getByRole('option', { name: '퇴직 요청자 (비활성)' })).toBeInTheDocument()
    expect(screen.getAllByText('비활성').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByRole('rowheader', { name: /퇴직 요청자\s*비활성/ })).toBeInTheDocument()
  })

  it('shows an empty state instead of zero-dividing charts when a valid filter combination has no rows', () => {
    const data = emptyData()
    data.profiles = [{ id: 'member-1', email: 'one@example.com', name: '한 요청자', role: 'member' }]
    data.reviewRequests = [request({ id: 'only-approved', requester_id: 'member-1', status: 'approved' })]

    render(<ReviewStatsPanel data={data} />)
    fireEvent.change(screen.getByLabelText('상태'), { target: { value: 'rejected' } })

    expect(screen.getByRole('article', { name: '요청 건수 0건' })).toBeInTheDocument()
    expect(screen.getByText('선택한 조건에 해당하는 검토 데이터가 없습니다.')).toBeInTheDocument()
    expect(screen.queryByText(/NaN|Infinity/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list', { name: '검토 상태 분포' })).not.toBeInTheDocument()
  })
})
