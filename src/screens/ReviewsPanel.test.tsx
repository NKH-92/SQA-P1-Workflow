import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../demoData'
import { ReviewsPanel } from './ReviewsPanel'

describe('ReviewsPanel', () => {
  it('renders review list and filters by status', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
    })

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={mutate} setData={() => undefined} />,
    )

    expect(screen.getByRole('heading', { name: /전체 검토요청|검토요청/ })).toBeInTheDocument()
    expect(screen.getByLabelText('검토요청 목록')).toBeInTheDocument()

    const select = screen.getByRole('combobox')
    await user.selectOptions(select, 'approved')

    const approvedOnly = data.reviewRequests.filter((request) => request.status === 'approved')
    if (approvedOnly.length === 0) {
      expect(screen.getByText('검토요청이 없습니다.')).toBeInTheDocument()
    } else {
      expect(screen.getByText(approvedOnly[0]!.title)).toBeInTheDocument()
    }
  })
})
