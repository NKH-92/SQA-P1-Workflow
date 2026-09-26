import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile, ReviewRequest } from '../../../types'
import { ReviewDetail } from './ReviewDetail'
import { ReviewRequestItem, type ReviewRequestItemHandlers } from './ReviewRequestItem'

vi.mock('../../../lib/supabase', () => ({ hasSupabaseConfig: false }))

const member: Profile = {
  id: 'member-1',
  email: 'member@example.com',
  name: '파트원 A',
  role: 'member',
}

const leader: Profile = { id: 'leader-1', email: 'leader@example.com', name: '파트장', role: 'leader' }

const rejectedRequest: ReviewRequest = {
  id: 'review-1',
  requester_id: member.id,
  title: '반려된 검토요청',
  description: '수정이 필요한 요청입니다.',
  due_date: null,
  status: 'rejected',
  review_round: 1,
  rejection_count: 2,
  last_submitted_at: '2026-07-15T01:00:00.000Z',
  closed_at: '2026-07-16T01:00:00.000Z',
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-15T01:00:00.000Z',
  profiles: { name: member.name, email: member.email },
  review_feedback: [
    {
      id: 'leader-feedback',
      review_request_id: 'review-1',
      leader_id: 'leader-1',
      author_role: 'leader',
      comment: '반려 사유',
      created_at: '2026-07-14T01:00:00.000Z',
      profiles: { name: '파트장' },
    },
    {
      id: 'member-feedback',
      review_request_id: 'review-1',
      leader_id: member.id,
      author_role: 'member',
      comment: '이전 수정 내용',
      created_at: '2026-07-14T02:00:00.000Z',
      profiles: { name: member.name },
    },
  ],
}

const pendingRequest: ReviewRequest = {
  ...rejectedRequest,
  id: 'review-2',
  title: '파트너 API 전환 검토',
  status: 'pending',
  rejection_count: 0,
  closed_at: null,
  due_date: '2026-07-05',
  review_feedback: [],
}

function handlers(overrides: Partial<ReviewRequestItemHandlers> = {}): ReviewRequestItemHandlers {
  return {
    onApprove: vi.fn(async () => true),
    onReject: vi.fn(async () => true),
    onReopen: vi.fn(async () => true),
    onEdit: vi.fn(),
    onResubmit: vi.fn(),
    onWithdraw: vi.fn(),
    addFeedback: vi.fn(async () => true),
    updateFeedback: vi.fn(async () => true),
    voidFeedback: vi.fn(async () => true),
    ...overrides,
  }
}

function renderItem(
  request: ReviewRequest,
  profile: Profile,
  props: Partial<ReviewRequestItemHandlers> & { compact?: boolean; inlineConfirm?: boolean; readOnly?: boolean } = {},
) {
  const { compact, inlineConfirm, readOnly, ...handlerOverrides } = props
  const itemHandlers = handlers(handlerOverrides)
  render(
    <ReviewRequestItem
      {...itemHandlers}
      compact={compact}
      inlineConfirm={inlineConfirm}
      profile={profile}
      readOnly={readOnly}
      request={request}
    />,
  )
  return itemHandlers
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ReviewRequestItem member resubmission', () => {
  it('shows the rejection count, author roles, and one 고쳐서 다시 요청하기 action', async () => {
    const user = userEvent.setup()
    const itemHandlers = renderItem(rejectedRequest, member)

    expect(screen.getByText('반려 2회')).toBeInTheDocument()
    expect(screen.getByText(/파트장 · 파트장/)).toBeInTheDocument()
    expect(screen.getByText(/파트원 A · 파트원/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수정' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /재검토 요청 내용|검토 피드백/ })).toBeNull()

    await user.click(screen.getByRole('button', { name: '고쳐서 다시 요청하기' }))
    expect(itemHandlers.onResubmit).toHaveBeenCalledWith(rejectedRequest)
  })

  it('opens the withdraw reason prompt directly from the more menu, with an undo icon instead of a trash can', async () => {
    const user = userEvent.setup()
    const itemHandlers = renderItem(pendingRequest, member)

    expect(screen.getByRole('button', { name: '수정' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '‘파트너 API 전환 검토’ 더보기' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByRole('menuitem', { name: '링크 복사' })).toBeInTheDocument()
    await user.click(within(menu).getByRole('menuitem', { name: '회수하기' }))

    expect(itemHandlers.onWithdraw).toHaveBeenCalledWith(pendingRequest)
    expect(screen.queryByRole('button', { name: '회수 확인' })).toBeNull()
  })
})

describe('ReviewRequestItem leader decisions', () => {
  it('shows the status once as a badge and offers 반려하기 and 승인하기 only', () => {
    renderItem(pendingRequest, leader)

    expect(screen.queryByRole('button', { name: /대기/ })).toBeNull()
    expect(screen.getByText('대기 중')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '반려하기' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '승인하기' })).toHaveClass('primary')
    expect(screen.getByRole('heading', { level: 2, name: '파트너 API 전환 검토' })).toHaveAttribute('tabindex', '-1')
    // 요청 한 번뿐인 대기 요청은 위쪽 요청 표기와 겹치므로 진행 기록 줄을 생략한다.
    expect(screen.queryByRole('list', { name: '진행 기록' })).toBeNull()
    expect(screen.getByRole('button', { name: '피드백 남기기' })).not.toHaveClass('primary')
  })

  it('confirms approval with a result-oriented dialog', async () => {
    const user = userEvent.setup()
    const itemHandlers = renderItem(pendingRequest, leader)

    await user.click(screen.getByRole('button', { name: '승인하기' }))
    const dialog = screen.getByRole('dialog', { name: '‘파트너 API 전환 검토’를 승인할까요?' })
    expect(dialog).toHaveTextContent('승인하면 요청자에게 결과가 전달돼요. 필요하면 나중에 다시 열 수 있어요.')
    const buttons = within(dialog).getAllByRole('button').filter((button) => !button.classList.contains('modal-close'))
    expect(buttons.map((button) => button.textContent)).toEqual(['닫기', '승인하기'])

    await user.click(within(dialog).getByRole('button', { name: '승인하기' }))
    await waitFor(() => expect(itemHandlers.onApprove).toHaveBeenCalledWith(pendingRequest))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('requires a rejection reason and pre-fills it from the feedback draft', async () => {
    const user = userEvent.setup()
    const itemHandlers = renderItem(pendingRequest, leader)

    await user.click(screen.getByRole('button', { name: '반려하기' }))
    let dialog = screen.getByRole('dialog', { name: '‘파트너 API 전환 검토’를 반려할까요?' })
    expect(dialog).toHaveTextContent('반려 사유는 파트원 A에게 바로 전달돼요. 파트원 A는 내용을 고쳐 다시 요청할 수 있어요.')
    const reason = within(dialog).getByRole('textbox', { name: /반려 사유/ })
    await user.click(within(dialog).getByRole('button', { name: '반려하기' }))

    expect(itemHandlers.onReject).not.toHaveBeenCalled()
    expect(reason).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText('반려 사유를 적어 주세요.')).toHaveAttribute('id', reason.getAttribute('aria-describedby')?.split(' ')[0])
    await waitFor(() => expect(reason).toHaveFocus())

    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    await user.type(screen.getByRole('textbox', { name: '검토 피드백' }), '  영향 범위 표를 추가해 주세요  ')
    await user.click(screen.getByRole('button', { name: '반려하기' }))
    dialog = screen.getByRole('dialog', { name: '‘파트너 API 전환 검토’를 반려할까요?' })
    expect(within(dialog).getByRole('textbox', { name: /반려 사유/ })).toHaveValue('  영향 범위 표를 추가해 주세요  ')
    expect(dialog).toHaveTextContent('작성 중이던 피드백을 옮겨 왔어요.')

    await user.click(within(dialog).getByRole('button', { name: '반려하기' }))
    await waitFor(() => expect(itemHandlers.onReject).toHaveBeenCalledWith(pendingRequest, '영향 범위 표를 추가해 주세요'))
  })

  it('keeps 다시 열기 visible for a decided request and confirms inline inside another dialog', async () => {
    const user = userEvent.setup()
    const approved = { ...pendingRequest, status: 'approved' as const, closed_at: '2026-07-20T00:00:00.000Z' }
    const itemHandlers = renderItem(approved, leader, { inlineConfirm: true, readOnly: true })

    await user.click(screen.getByRole('button', { name: '다시 열기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    const confirm = screen.getByRole('group', { name: /다시 열까요\?/ })
    await waitFor(() => expect(within(confirm).getByRole('button', { name: '닫기' })).toHaveFocus())
    await user.click(within(confirm).getByRole('button', { name: '다시 열기' }))

    await waitFor(() => expect(itemHandlers.onReopen).toHaveBeenCalledWith(approved))
  })

  it('moves the main actions into the bottom action bar on compact screens', () => {
    renderItem(pendingRequest, leader, { compact: true })

    const bar = document.querySelector('.mobile-action-bar') as HTMLElement
    expect(bar).not.toBeNull()
    expect(within(bar).getAllByRole('button').map((button) => button.textContent)).toEqual(['반려하기', '승인하기'])
    expect(screen.getAllByRole('button', { name: '승인하기' })).toHaveLength(1)
  })
})

describe('ReviewDetail', () => {
  it('does not announce the whole pane as a live region', () => {
    const { container } = render(
      <ReviewDetail {...handlers()} profile={leader} selectedReview={pendingRequest} />,
    )

    expect(container.querySelector('[aria-live]')).toBeNull()
    expect(screen.getByRole('heading', { name: '처리 기록', level: 3 })).toBeInTheDocument()
  })
})
