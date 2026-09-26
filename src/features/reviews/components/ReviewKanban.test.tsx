import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewRequest } from '../../../types'
import { ReviewKanban } from './ReviewKanban'

function requests(count: number): ReviewRequest[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `review-${index + 1}`,
    requester_id: 'member-1',
    title: `검토 항목 ${index + 1}`,
    description: '',
    due_date: null,
    status: 'pending' as const,
    profiles: { name: '파트원', email: 'member@example.com' },
  }))
}

afterEach(cleanup)

describe('ReviewKanban', () => {
  it('shows all four workflow states with the glossary names, including recent withdrawals', () => {
    const withdrawn = { ...requests(1)[0]!, id: 'withdrawn-1', title: '최근 회수', status: 'withdrawn' as const }
    render(<ReviewKanban requests={[withdrawn]} selectedReviewId={null} onSelectReview={vi.fn()} />)

    expect(screen.getAllByRole('region').map((region) => region.getAttribute('aria-label'))).toEqual([
      '대기 중 0건',
      '승인 0건',
      '반려 0건',
      '회수 1건',
    ])
    expect(within(screen.getByRole('region', { name: '회수 1건' })).getByText('최근 회수')).toBeInTheDocument()
  })

  it('shows a decided card by its decision day instead of an overdue due date', () => {
    const approved: ReviewRequest = {
      ...requests(1)[0]!,
      id: 'approved-1',
      status: 'approved',
      due_date: '2026-01-01',
      closed_at: '2026-09-25T16:30:00.000Z',
    }
    render(<ReviewKanban requests={[approved]} selectedReviewId={null} onSelectReview={vi.fn()} />)

    const column = screen.getByRole('region', { name: '승인 1건' })
    expect(within(column).getByText('9월 26일 승인')).toBeInTheDocument()
    expect(within(column).queryByText(/지남/)).toBeNull()
  })

  it('shows three cards per column by default and lets the leader expand and collapse', async () => {
    const user = userEvent.setup()
    render(<ReviewKanban requests={requests(5)} selectedReviewId={null} onSelectReview={vi.fn()} />)

    expect(screen.getByText('검토 항목 1')).toBeInTheDocument()
    expect(screen.getByText('검토 항목 3')).toBeInTheDocument()
    expect(screen.queryByText('검토 항목 4')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '나머지 2건 보기' }))
    expect(screen.getByText('검토 항목 4')).toBeInTheDocument()
    expect(screen.getByText('검토 항목 5')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '접기' }))
    expect(screen.queryByText('검토 항목 4')).not.toBeInTheDocument()
  })

  it('automatically reveals a selected card outside the first three', () => {
    render(<ReviewKanban requests={requests(5)} selectedReviewId="review-5" onSelectReview={vi.fn()} />)

    expect(screen.getByText('검토 항목 5')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '접기' })).toHaveAttribute('aria-expanded', 'true')
  })
})
