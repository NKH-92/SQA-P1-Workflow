import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Profile, ReviewRequest } from '../../../types'
import { ReviewRequestItem } from './ReviewRequestItem'

const member: Profile = {
  id: 'member-1',
  email: 'member@example.com',
  name: '파트원 A',
  role: 'member',
}

const request: ReviewRequest = {
  id: 'review-1',
  requester_id: member.id,
  title: '반려된 검토요청',
  description: '수정이 필요한 요청입니다.',
  due_date: null,
  status: 'rejected',
  review_round: 1,
  rejection_count: 2,
  last_submitted_at: '2026-07-15T01:00:00.000Z',
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

function renderItem(resubmitReview = vi.fn(async () => true)) {
  render(
    <ReviewRequestItem
      addFeedback={vi.fn(async () => true)}
      voidFeedback={vi.fn(async () => true)}
      onEdit={vi.fn()}
      onWithdraw={vi.fn()}
      pendingWithdraw={false}
      profile={member}
      rejectReview={vi.fn(async () => true)}
      reopenReview={vi.fn(async () => true)}
      request={request}
      resubmitReview={resubmitReview}
      updateFeedback={vi.fn(async () => true)}
      updateStatus={vi.fn(async () => true)}
      withdrawReview={vi.fn()}
    />,
  )
  return resubmitReview
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ReviewRequestItem member resubmission', () => {
  it('shows rejection history, author roles, edit, and the resubmit composer', () => {
    renderItem()

    expect(screen.getByText('반려 이력 2회')).toBeTruthy()
    expect(screen.getByRole('button', { name: '수정' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: '회수' })).toBeNull()
    expect(screen.getByText(/파트장 · 파트장/)).toBeTruthy()
    expect(screen.getByText(/파트원 A · 파트원/)).toBeTruthy()
    expect(screen.getByPlaceholderText('수정한 내용과 확인받을 사항을 파트장에게 알려주세요.')).toBeTruthy()
    expect(screen.getByRole<HTMLButtonElement>('button', { name: '피드백 작성 후 재검토 요청' }).disabled).toBe(true)
  })

  it('submits member feedback through the same-request resubmission handler', async () => {
    const user = userEvent.setup()
    const resubmitReview = renderItem()
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    await user.type(
      screen.getByPlaceholderText('수정한 내용과 확인받을 사항을 파트장에게 알려주세요.'),
      '요청하신 내용을 모두 수정했습니다.',
    )
    await user.click(screen.getByRole('button', { name: '피드백 작성 후 재검토 요청' }))

    await waitFor(() => {
      expect(resubmitReview).toHaveBeenCalledWith(request.id, '요청하신 내용을 모두 수정했습니다.')
    })
  })
})
