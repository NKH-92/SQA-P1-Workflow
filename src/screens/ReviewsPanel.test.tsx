import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import * as dataModule from '../data'
import type { AppData } from '../types'
import { reviewDraftStorageKey } from '../features/reviews/useReviewDraft'
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
      return true
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

  it('clears the list status filter when switching to kanban', async () => {
    const user = userEvent.setup()
    const source = createPreviewData()
    const pending = source.reviewRequests.find((request) => request.status === 'pending')!
    const approved = {
      ...pending,
      id: 'review-approved-recent',
      title: '최근 완료 검토',
      status: 'approved' as const,
      closed_at: new Date().toISOString(),
    }
    const data = { ...source, reviewRequests: [pending, approved] }

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={vi.fn()} setData={vi.fn()} />,
    )

    const filterGroup = screen.getByRole('group', { name: '검토요청 상태 필터' })
    await user.click(within(filterGroup).getByRole('button', { name: /^완료/ }))
    expect(screen.queryByText(pending.title)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '칸반' }))

    expect(screen.getByText(pending.title)).toBeInTheDocument()
    expect(screen.getAllByText(approved.title).length).toBeGreaterThan(0)
  })

  it('keeps the member withdrawal archive as one dedicated entry and loads its first page once', async () => {
    const user = userEvent.setup()
    const archiveSpy = vi.spyOn(dataModule, 'fetchWithdrawnReviewRequestsPage').mockResolvedValue([])

    render(
      <ReviewsPanel
        profile={previewMember}
        data={createPreviewData()}
        mutate={vi.fn()}
        setData={vi.fn()}
      />,
    )

    const filterGroup = screen.getByRole('group', { name: '검토요청 상태 필터' })
    expect(within(filterGroup).queryByRole('button', { name: /회수됨/ })).not.toBeInTheDocument()
    const archiveButton = screen.getByRole('button', { name: '회수 보관함' })
    expect(archiveButton).not.toHaveTextContent('0')

    await user.click(archiveButton)
    await waitFor(() => expect(archiveSpy).toHaveBeenCalledTimes(1))
    await user.click(archiveButton)
    await user.click(archiveButton)
    expect(archiveSpy).toHaveBeenCalledTimes(1)
    archiveSpy.mockRestore()
  })

  it('replaces the leader withdrawal archive with one searchable review-history entry', async () => {
    const user = userEvent.setup()
    const historySpy = vi.spyOn(dataModule, 'fetchReviewHistoryPage').mockResolvedValue({
      schema_version: 1,
      snapshot_at: '2026-08-01T03:00:00.000Z',
      rows: [],
      has_more: false,
      next_cursor: null,
    })

    render(
      <ReviewsPanel
        profile={previewLeader}
        data={createPreviewData()}
        mutate={vi.fn()}
        setData={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: '회수 보관함' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '검토 이력' }))
    expect(await screen.findByRole('dialog', { name: '검토 이력' })).toBeInTheDocument()
    await waitFor(() => expect(historySpy).toHaveBeenCalledTimes(1))
    historySpy.mockRestore()
  })

  it('resets form after edit so a new write starts empty', async () => {
    const user = userEvent.setup()
    const data = memberDataWithPendingReview()
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
      return true
    })

    render(
      <ReviewsPanel profile={previewMember} data={data} mutate={mutate} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '수정' }))
    const dialog = composerDialog()
    expect(within(dialog).getByLabelText(/^제목/)).toHaveValue('수정 테스트 제목')

    await user.click(within(dialog).getByRole('button', { name: '검토요청 작성 닫기' }))
    localStorage.removeItem(reviewDraftStorageKey(previewMember.id))

    await user.click(screen.getByRole('button', { name: '검토요청 작성' }))
    const newDialog = composerDialog()
    expect(within(newDialog).getByLabelText(/^제목/)).toHaveValue('')
    expect(within(newDialog).getByLabelText(/^설명/)).toHaveValue('')
  })

  it('restores a saved draft when opening the composer', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const now = new Date()
    const draft = {
      title: '초안 제목',
      description: '초안 설명',
      deadlineMode: 'date',
      due_date: '2026-07-12',
      saved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    localStorage.setItem(reviewDraftStorageKey(previewMember.id), JSON.stringify(draft))

    render(
      <ReviewsPanel profile={previewMember} data={data} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 작성' }))

    const dialog = composerDialog()
    expect(within(dialog).getByLabelText(/^제목/)).toHaveValue('초안 제목')
    expect(within(dialog).getByLabelText(/^설명/)).toHaveValue('초안 설명')
    expect(within(dialog).getByText('이 기기에 저장된 초안을 불러왔습니다.')).toBeInTheDocument()
  })

  it('directs reviewers to exchange files outside the system', async () => {
    const user = userEvent.setup()
    render(
      <ReviewsPanel profile={previewMember} data={createPreviewData()} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 작성' }))

    expect(
      within(composerDialog()).getByText(/검토 자료가 필요한 경우 별도 메신저로 전달하고/),
    ).toBeInTheDocument()
  })

  it('saves draft only when the user clicks 초안 저장', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()

    render(
      <ReviewsPanel profile={previewMember} data={data} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 작성' }))
    const dialog = composerDialog()
    await user.type(within(dialog).getByLabelText(/^제목/), '수동 초안')
    await user.click(within(dialog).getByRole('button', { name: '초안 저장' }))

    const raw = localStorage.getItem(reviewDraftStorageKey(previewMember.id))
    expect(raw).toContain('수동 초안')
    expect(raw).toContain('expires_at')
  })

  it('allows rejection without feedback after explicit confirmation', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const rejectSpy = vi.spyOn(dataModule, 'rejectReviewRequest').mockResolvedValue(undefined as never)
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
      return true
    })

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={mutate} setData={() => undefined} />,
    )

    const detail = screen.getByRole('article')
    await user.click(within(detail).getByRole('button', { name: '반려' }))

    const dialog = screen.getByRole('dialog', { name: '검토요청을 반려할까요?' })
    expect(within(dialog).getByText('댓글 없이 검토요청을 반려합니다.')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '반려하기' }))
    expect(rejectSpy).toHaveBeenCalledWith(expect.anything(), expect.any(String), '')
    rejectSpy.mockRestore()
  })

  it('keeps feedback draft local to the selected request and submits the exact comment', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const feedbackSpy = vi.spyOn(dataModule, 'addReviewFeedback').mockResolvedValue(undefined as never)
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
      return true
    })

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={mutate} setData={() => undefined} />,
    )

    const detail = screen.getByRole('article')
    const textarea = within(detail).getByPlaceholderText('이 검토요청에 대해 어떻게 생각하시나요?')
    await user.type(textarea, '정확한 피드백')
    await user.click(within(detail).getByRole('button', { name: '피드백 남기기' }))

    expect(feedbackSpy).toHaveBeenCalledWith(expect.anything(), expect.any(String), '정확한 피드백')
    expect(textarea).toHaveValue('')
    feedbackSpy.mockRestore()
  })

  it('keeps the local draft when the feedback mutation is rejected', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn(async () => false)

    render(
      <ReviewsPanel profile={previewLeader} data={createPreviewData()} mutate={mutate} setData={() => undefined} />,
    )

    const detail = screen.getByRole('article')
    const textarea = within(detail).getByPlaceholderText('이 검토요청에 대해 어떻게 생각하시나요?')
    await user.type(textarea, '재시도할 피드백')
    await user.click(within(detail).getByRole('button', { name: '피드백 남기기' }))

    expect(textarea).toHaveValue('재시도할 피드백')
  })

  it('acknowledges an unread deep-linked review when a hidden tab becomes visible', async () => {
    const markSeenSpy = vi.spyOn(dataModule, 'markReviewSeen').mockResolvedValue(undefined as never)
    const originalVisibilityState = document.visibilityState
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })

    try {
      render(
        <ReviewsPanel
          profile={previewLeader}
          data={createPreviewData()}
          initialSelectedId="review-02"
          mutate={vi.fn()}
          setData={vi.fn()}
        />,
      )

      expect(markSeenSpy).not.toHaveBeenCalled()
      Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
      document.dispatchEvent(new Event('visibilitychange'))

      await waitFor(() => expect(markSeenSpy).toHaveBeenCalledWith(expect.anything(), 'review-02'))
    } finally {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: originalVisibilityState,
      })
      markSeenSpy.mockRestore()
    }
  })

  it('locks the reopen action while its mutation is in flight', async () => {
    const user = userEvent.setup()
    const source = createPreviewData()
    const request = {
      ...source.reviewRequests[0]!,
      status: 'approved' as const,
      closed_at: new Date().toISOString(),
    }
    const data = { ...source, reviewRequests: [request] }
    let resolveReopen!: () => void
    const reopenSpy = vi.spyOn(dataModule, 'reopenReviewRequest').mockImplementation(
      () => new Promise<void>((resolve) => {
        resolveReopen = resolve
      }),
    )
    const mutate = vi.fn(async (operation: () => Promise<void>) => {
      await operation()
      return true
    })

    render(<ReviewsPanel profile={previewLeader} data={data} mutate={mutate} setData={() => undefined} />)

    const reopenButton = screen.getByRole('button', { name: '다시 열기' })
    await user.click(reopenButton)
    await user.click(within(screen.getByRole('dialog', { name: '검토요청을 다시 열까요?' })).getByRole('button', { name: '다시 열기' }))
    expect(reopenSpy).toHaveBeenCalledTimes(1)
    expect(reopenButton).toBeDisabled()

    await user.click(reopenButton)
    expect(reopenSpy).toHaveBeenCalledTimes(1)

    resolveReopen()
    await waitFor(() => expect(reopenButton).not.toBeDisabled())
    reopenSpy.mockRestore()
  })
})
