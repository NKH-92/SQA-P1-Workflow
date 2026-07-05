import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import * as dataModule from '../data'
import type { AppData } from '../types'
import { ReviewsPanel } from './ReviewsPanel'

function memberDataWithPendingReview(): AppData {
  const data = createPreviewData()
  return {
    ...data,
    reviewRequests: [
      {
        id: 'review-member-pending',
        requester_id: previewMember.id,
        title: '수정 테스트 제목',
        description: '수정 테스트 설명',
        attachment_url: 'https://example.com/attachment',
        due_date: '2026-07-10',
        status: 'pending',
        created_at: '2026-07-04T09:00:00.000Z',
        updated_at: '2026-07-04T09:00:00.000Z',
        profiles: { name: previewMember.name, email: previewMember.email },
        review_feedback: [],
      },
      ...data.reviewRequests,
    ],
  }
}

describe('ReviewsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  afterEach(() => {
    cleanup()
  })

  function composerDialog() {
    return screen.getByRole('dialog', { name: /무엇을 검토받고 싶으세요\?|요청 내용을 수정하세요/ })
  }

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

    const filterGroup = screen.getByRole('group', { name: '검토요청 상태 필터' })
    await user.click(within(filterGroup).getByRole('button', { name: /^완료/ }))

    const approvedOnly = data.reviewRequests.filter((request) => request.status === 'approved')
    if (approvedOnly.length === 0) {
      expect(screen.getByText('검토요청이 없습니다.')).toBeInTheDocument()
    } else {
      expect(screen.getAllByText(approvedOnly[0]!.title).length).toBeGreaterThan(0)
    }
  })

  it('resets form after edit so a new write starts empty', async () => {
    const user = userEvent.setup()
    const data = memberDataWithPendingReview()
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
    })

    render(
      <ReviewsPanel profile={previewMember} data={data} mutate={mutate} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '수정' }))
    const dialog = composerDialog()
    expect(within(dialog).getByLabelText(/^제목/)).toHaveValue('수정 테스트 제목')

    await user.click(within(dialog).getByRole('button', { name: '검토요청 작성 닫기' }))
    localStorage.removeItem(`draft:review:${previewMember.id}`)

    await user.click(screen.getByRole('button', { name: '검토요청 작성', exact: true }))
    const newDialog = composerDialog()
    expect(within(newDialog).getByLabelText(/^제목/)).toHaveValue('')
    expect(within(newDialog).getByLabelText(/^설명/)).toHaveValue('')
    expect(within(newDialog).getByLabelText('첨부 링크(URL)')).toHaveValue('')
  })

  it('restores a saved draft when opening the composer', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const draft = {
      title: '초안 제목',
      description: '초안 설명',
      attachment_url: 'https://example.com/draft',
      deadlineMode: 'date',
      due_date: '2026-07-12',
    }
    localStorage.setItem(`draft:review:${previewMember.id}`, JSON.stringify(draft))

    render(
      <ReviewsPanel profile={previewMember} data={data} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 작성', exact: true }))

    const dialog = composerDialog()
    expect(within(dialog).getByLabelText(/^제목/)).toHaveValue('초안 제목')
    expect(within(dialog).getByLabelText(/^설명/)).toHaveValue('초안 설명')
    expect(within(dialog).getByLabelText('첨부 링크(URL)')).toHaveValue('https://example.com/draft')
    expect(within(dialog).getByText('이 기기에 저장된 초안을 불러왔습니다.')).toBeInTheDocument()
  })

  it('shows reject feedback notice without calling rejectReviewRequest when feedback is empty', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const rejectSpy = vi.spyOn(dataModule, 'rejectReviewRequest').mockResolvedValue(undefined as never)
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
    })

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={mutate} setData={() => undefined} />,
    )

    const detail = screen.getByRole('article')
    await user.click(within(detail).getByRole('button', { name: '반려' }))

    expect(screen.getByText('반려하려면 피드백에 사유를 먼저 입력해 주세요.')).toBeInTheDocument()
    expect(rejectSpy).not.toHaveBeenCalled()
    rejectSpy.mockRestore()
  })
})
