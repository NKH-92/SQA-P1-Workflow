import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
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
  it('shows three cards per column by default and lets the leader expand and collapse', async () => {
    const user = userEvent.setup()
    render(<ReviewKanban requests={requests(5)} selectedReviewId={null} onSelectReview={vi.fn()} />)

    expect(screen.getByText('검토 항목 1')).toBeInTheDocument()
    expect(screen.getByText('검토 항목 3')).toBeInTheDocument()
    expect(screen.queryByText('검토 항목 4')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '나머지 2개 보기' }))
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
