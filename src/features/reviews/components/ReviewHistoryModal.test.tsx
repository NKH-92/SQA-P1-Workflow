import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewLeader } from '../../../demoData'
import type { ReviewHistoryPage, ReviewHistoryRow } from '../../../types'
import { ReviewHistoryModal } from './ReviewHistoryModal'

vi.mock('../../../lib/supabase', () => ({ hasSupabaseConfig: false }))

afterEach(cleanup)

const historyRow: ReviewHistoryRow = {
  id: 'history-1',
  requester_id: 'member-1',
  title: '과거 CAPA 검토',
  description: '변경 영향 평가를 확인합니다.',
  due_date: null,
  status: 'rejected',
  terminal_at: '2026-07-20T03:00:00.000Z',
  closed_at: '2026-07-20T03:00:00.000Z',
  created_at: '2026-07-10T03:00:00.000Z',
  updated_at: '2026-07-20T03:00:00.000Z',
  profiles: { name: '김요청', email: 'member@example.com' },
  review_feedback: [],
}

function page(rows: ReviewHistoryRow[] = [historyRow]): ReviewHistoryPage {
  return {
    schema_version: 1,
    snapshot_at: '2026-08-01T03:00:00.000Z',
    rows,
    has_more: false,
    next_cursor: null,
  }
}

describe('ReviewHistoryModal', () => {
  it('loads a page and sends title/body/requester search filters', async () => {
    const user = userEvent.setup()
    const onLoadPage = vi.fn().mockResolvedValue(page())

    render(
      <ReviewHistoryModal
        onClose={vi.fn()}
        onLoadPage={onLoadPage}
        onReopen={vi.fn()}
        open
        profile={previewLeader}
      />,
    )

    expect((await screen.findAllByText('과거 CAPA 검토')).length).toBeGreaterThan(0)
    await user.type(screen.getByRole('searchbox', { name: '검토 이력 검색' }), '김요청')
    await user.click(screen.getByRole('button', { name: /^검색$/ }))

    await waitFor(() => expect(onLoadPage).toHaveBeenLastCalledWith(
      { status: null, query: '김요청', from: null, to: null },
      null,
    ))
  })

  it('reopens a terminal review and closes only after success', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const onReopen = vi.fn().mockResolvedValue(true)

    render(
      <ReviewHistoryModal
        onClose={onClose}
        onLoadPage={vi.fn().mockResolvedValue(page())}
        onReopen={onReopen}
        open
        profile={previewLeader}
      />,
    )

    const article = await screen.findByRole('article')
    await user.click(within(article).getByRole('button', { name: '다시 열기' }))
    const confirmation = screen.getByRole('dialog', { name: '검토요청을 다시 열까요?' })
    await user.click(within(confirmation).getByRole('button', { name: '다시 열기' }))

    await waitFor(() => expect(onReopen).toHaveBeenCalledWith('history-1'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
