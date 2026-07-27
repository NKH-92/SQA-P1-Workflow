import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReviewEvent } from '../../../types'
import { reviewEventLabel } from '../reviewEventPresentation'
import { ReviewEventHistory } from './ReviewEventHistory'

vi.mock('../../../lib/supabase', () => ({ hasSupabaseConfig: false }))

afterEach(cleanup)

describe('ReviewEventHistory', () => {
  it('renders localized event labels and an Asia/Seoul minute timestamp', async () => {
    const event: ReviewEvent = {
      id: 1,
      review_request_id: 'review-1',
      actor_id: 'leader-1',
      actor_name_snapshot: '파트장',
      event_type: 'approved',
      from_status: 'pending',
      to_status: 'approved',
      occurred_at: '2026-07-23T05:32:00.000Z',
      metadata: {},
      transaction_id: 1,
    }

    render(<ReviewEventHistory localEvents={[event]} reviewRequestId="review-1" />)

    expect(await screen.findByText('승인')).toBeInTheDocument()
    const timestamp = screen.getByText(/2026.*07.*23.*14.*32/)
    expect(timestamp.tagName).toBe('TIME')
    expect(timestamp).toHaveAttribute('datetime', event.occurred_at)
  })

  it('uses a safe fallback for unknown future event codes', () => {
    expect(reviewEventLabel('future_event')).toBe('기타 검토 이벤트')
  })
})
