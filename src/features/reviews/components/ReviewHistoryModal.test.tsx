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

const olderRow: ReviewHistoryRow = {
  ...historyRow,
  id: 'history-0',
  title: '더 오래된 검토',
  status: 'approved',
  terminal_at: '2026-07-01T03:00:00.000Z',
  closed_at: '2026-07-01T03:00:00.000Z',
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

  it('orders rows by decision time and can flip to oldest first', async () => {
    const user = userEvent.setup()
    render(
      <ReviewHistoryModal
        onClose={vi.fn()}
        onLoadPage={vi.fn().mockResolvedValue(page([olderRow, historyRow]))}
        onReopen={vi.fn()}
        open
        profile={previewLeader}
      />,
    )

    const list = await screen.findByRole('complementary', { name: '검토 이력 목록' })
    const rowTitles = () => Array.from(list.querySelectorAll('.review-history-row-title')).map((node) => node.textContent)
    await waitFor(() => expect(rowTitles()).toEqual(['과거 CAPA 검토', '더 오래된 검토']))
    expect(within(list).getByText('7월 20일 반려')).toBeInTheDocument()

    await user.click(within(list).getByRole('button', { name: '오래된순' }))
    expect(rowTitles()).toEqual(['더 오래된 검토', '과거 CAPA 검토'])
  })

  it('reopens a terminal review with an inline confirmation and closes only after success', async () => {
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
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    const confirmation = within(article).getByRole('group', { name: /다시 열까요\?/ })
    await user.click(within(confirmation).getByRole('button', { name: '다시 열기' }))

    await waitFor(() => expect(onReopen).toHaveBeenCalledWith(expect.objectContaining({ id: 'history-1' })))
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
