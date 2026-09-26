import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import * as dataModule from '../data'
import type { MutateFn } from '../app/types'
import type { AppData, Profile, ReviewRequest } from '../types'
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

function memberDataWithRejectedReview(): AppData {
  const data = createPreviewData()
  const rejected: ReviewRequest = {
    id: 'review-member-rejected',
    requester_id: previewMember.id,
    title: '반려된 요청',
    description: '처음 설명',
    due_date: null,
    status: 'rejected',
    review_round: 1,
    rejection_count: 1,
    closed_at: new Date().toISOString(),
    created_at: '2026-07-04T09:00:00.000Z',
    updated_at: '2026-07-05T09:00:00.000Z',
    profiles: { name: previewMember.name, email: previewMember.email },
    review_feedback: [{
      id: 'feedback-reject',
      review_request_id: 'review-member-rejected',
      leader_id: previewLeader.id,
      author_role: 'leader',
      comment: '영향 범위 표가 빠져 있어요.',
      created_at: '2026-07-05T09:00:00.000Z',
      profiles: { name: previewLeader.name },
    }],
  }
  return { ...data, reviewRequests: [rejected, ...data.reviewRequests] }
}

/** 실제 로컬 저장소 변경을 확인하려고 data 상태를 들고 있는 테스트용 틀. */
function StatefulReviews({ initial, profile, mutate }: { initial: AppData; profile: Profile; mutate: MutateFn }) {
  const [data, setData] = useState(initial)
  return (
    <>
      <ReviewsPanel data={data} mutate={mutate} profile={profile} setData={setData} />
      <output data-testid="review-state">
        {JSON.stringify(data.reviewRequests.map(({ id, title, status, review_round }) => ({ id, title, status, review_round })))}
      </output>
    </>
  )
}

function passthroughMutate() {
  return vi.fn(async (operation: () => Promise<void>, _success?: unknown) => {
    await operation()
    return true
  })
}

describe('ReviewsPanel', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  function composerDialog() {
    return screen.getByRole('dialog', { name: /어떤 검토가 필요한가요\?|요청 내용을 고쳐 주세요|반려 사유를 반영해 고쳐 주세요/ })
  }

  it('renders review list and filters by status', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={passthroughMutate()} setData={() => undefined} />,
    )

    expect(screen.getByRole('heading', { level: 1, name: '검토요청' })).toBeInTheDocument()
    expect(screen.getByLabelText('검토요청 목록')).toBeInTheDocument()

    const filterGroup = screen.getByRole('group', { name: '검토요청 상태 필터' })
    expect(within(filterGroup).getAllByRole('button').map((button) => button.textContent?.replace(/\s*\d+$/, '')))
      .toEqual(['전체', '대기 중', '승인', '반려', '회수'])
    await user.click(within(filterGroup).getByRole('button', { name: /^승인/ }))

    const approvedOnly = data.reviewRequests.filter((request) => request.status === 'approved')
    if (approvedOnly.length === 0) {
      expect(screen.getByText('검토요청이 없어요')).toBeInTheDocument()
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
      title: '최근 승인 검토',
      status: 'approved' as const,
      closed_at: new Date().toISOString(),
    }
    const data = { ...source, reviewRequests: [pending, approved] }

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={vi.fn()} setData={vi.fn()} />,
    )

    const filterGroup = screen.getByRole('group', { name: '검토요청 상태 필터' })
    await user.click(within(filterGroup).getByRole('button', { name: /^승인/ }))
    expect(screen.queryByText(pending.title)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '칸반' }))

    expect(screen.getByText(pending.title)).toBeInTheDocument()
    expect(screen.getAllByText(approved.title).length).toBeGreaterThan(0)
  })

  it('keeps search, status filter, and view when the screen is opened again', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const view = render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={vi.fn()} setData={vi.fn()} />,
    )

    await user.type(screen.getByRole('searchbox', { name: '검토요청 검색' }), '정산')
    await user.click(within(screen.getByRole('group', { name: '검토요청 상태 필터' })).getByRole('button', { name: /^대기 중/ }))
    view.unmount()

    render(<ReviewsPanel profile={previewLeader} data={data} mutate={vi.fn()} setData={vi.fn()} />)

    expect(screen.getByRole('searchbox', { name: '검토요청 검색' })).toHaveValue('정산')
    expect(within(screen.getByRole('group', { name: '검토요청 상태 필터' })).getByRole('button', { name: /^대기 중/ }))
      .toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('heading', { level: 2, name: '정산 자동화 화면 문구 확인' })).toBeInTheDocument()
  })

  it('sorts by decision time and shows when each request was decided', async () => {
    const user = userEvent.setup()
    const source = createPreviewData()
    const base = source.reviewRequests[0]!
    const now = Date.now()
    const olderDecision = new Date(now - 2 * 60 * 60 * 1000).toISOString()
    const newerDecision = new Date(now - 60 * 1000).toISOString()
    const data = {
      ...source,
      reviewRequests: [
        ...source.reviewRequests,
        { ...base, id: 'approved-older', title: '먼저 승인한 요청', status: 'approved' as const, closed_at: olderDecision },
        { ...base, id: 'rejected-newer', title: '방금 반려한 요청', status: 'rejected' as const, closed_at: newerDecision },
      ],
    }

    render(<ReviewsPanel profile={previewLeader} data={data} mutate={vi.fn()} setData={vi.fn()} />)

    const sort = screen.getByRole('combobox', { name: '정렬' })
    expect(sort).toHaveValue('priority')
    await user.selectOptions(sort, '처리 시점순')

    const list = screen.getByLabelText('검토요청 목록')
    const titles = Array.from(list.querySelectorAll('.review-list-item strong')).map((node) => node.textContent)
    expect(titles.slice(0, 2)).toEqual(['방금 반려한 요청', '먼저 승인한 요청'])
    expect(within(list).getByText(/월 \d+일 반려$/)).toBeInTheDocument()
    expect(sessionStorage.getItem('sqa.view.reviews.leader.sort')).toBe('"decided"')
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
    expect(within(filterGroup).queryByRole('button', { name: /회수/ })).not.toBeInTheDocument()
    const archiveButton = screen.getByRole('button', { name: '회수 보관함' })
    expect(archiveButton).not.toHaveTextContent('0')

    await user.click(archiveButton)
    await waitFor(() => expect(archiveSpy).toHaveBeenCalledTimes(1))
    await user.click(archiveButton)
    await user.click(archiveButton)
    expect(archiveSpy).toHaveBeenCalledTimes(1)
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
  })

  it('resets form after edit so a new write starts empty', async () => {
    const user = userEvent.setup()
    const data = memberDataWithPendingReview()

    render(
      <ReviewsPanel profile={previewMember} data={data} mutate={passthroughMutate()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '수정' }))
    const dialog = composerDialog()
    expect(within(dialog).getByLabelText(/^제목/)).toHaveValue('수정 테스트 제목')

    await user.click(within(dialog).getByRole('button', { name: '검토요청 수정 닫기' }))
    localStorage.removeItem(reviewDraftStorageKey(previewMember.id))

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))
    const newDialog = composerDialog()
    expect(within(newDialog).getByLabelText(/^제목/)).toHaveValue('')
    expect(within(newDialog).getByLabelText(/^설명/)).toHaveValue('')
  })

  it('restores a saved draft when opening the composer', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const now = new Date()
    const draft = {
      title: '임시저장 제목',
      description: '임시저장 설명',
      deadlineMode: 'date',
      due_date: '2026-07-12',
      saved_at: now.toISOString(),
      expires_at: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    }
    localStorage.setItem(reviewDraftStorageKey(previewMember.id), JSON.stringify(draft))

    render(
      <ReviewsPanel profile={previewMember} data={data} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))

    const dialog = composerDialog()
    expect(within(dialog).getByLabelText(/^제목/)).toHaveValue('임시저장 제목')
    expect(within(dialog).getByLabelText(/^설명/)).toHaveValue('임시저장 설명')
    expect(within(dialog).getByText('이 기기에 임시저장한 내용을 불러왔어요.')).toBeInTheDocument()
    expect(within(dialog).getByText(/^임시저장됨 · 오[전후] \d{1,2}:\d{2}$/)).toBeInTheDocument()
    expect(within(dialog).queryByRole('button', { name: '초안 저장' })).toBeNull()
  })

  it('directs reviewers to exchange files outside the system', async () => {
    const user = userEvent.setup()
    render(
      <ReviewsPanel profile={previewMember} data={createPreviewData()} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))

    expect(
      within(composerDialog()).getByText(/검토 자료는 메신저로 따로 보내고/),
    ).toBeInTheDocument()
  })

  it('keeps typed text when the composer closes and reopens, and saves it without a manual button', async () => {
    const user = userEvent.setup()
    render(
      <ReviewsPanel profile={previewMember} data={createPreviewData()} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))
    await user.type(within(composerDialog()).getByLabelText(/^제목/), '자동 임시저장')
    await user.click(within(composerDialog()).getByRole('button', { name: '검토요청 작성 닫기' }))

    const raw = localStorage.getItem(reviewDraftStorageKey(previewMember.id))
    expect(raw).toContain('자동 임시저장')
    expect(raw).toContain('expires_at')
    expect(screen.getByText('쓰던 검토요청이 있어요. 이어서 쓰고 보내 주세요.')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))
    expect(within(composerDialog()).getByLabelText(/^제목/)).toHaveValue('자동 임시저장')
  })

  it('does not let editing an existing request overwrite a new request in progress', async () => {
    const user = userEvent.setup()
    render(
      <ReviewsPanel profile={previewMember} data={memberDataWithPendingReview()} mutate={vi.fn()} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))
    await user.type(within(composerDialog()).getByLabelText(/^제목/), '새로 쓰던 요청')
    await user.click(within(composerDialog()).getByRole('button', { name: '검토요청 작성 닫기' }))

    await user.click(screen.getByRole('button', { name: '수정' }))
    expect(within(composerDialog()).getByLabelText(/^제목/)).toHaveValue('수정 테스트 제목')
    await user.click(within(composerDialog()).getByRole('button', { name: '검토요청 수정 닫기' }))

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))
    expect(within(composerDialog()).getByLabelText(/^제목/)).toHaveValue('새로 쓰던 요청')
  })

  it('validates the composer inline and focuses the first field to fix', async () => {
    const user = userEvent.setup()
    const mutate = passthroughMutate()
    render(
      <ReviewsPanel profile={previewMember} data={createPreviewData()} mutate={mutate} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '검토요청 쓰기' }))
    const dialog = composerDialog()
    const submit = within(dialog).getByRole('button', { name: '검토요청 보내기' })
    expect(submit).toBeEnabled()
    await user.click(submit)

    const title = within(dialog).getByLabelText(/^제목/)
    expect(mutate).not.toHaveBeenCalled()
    expect(title).toHaveAttribute('aria-invalid', 'true')
    expect(within(dialog).getByText('제목을 입력해 주세요.')).toBeInTheDocument()
    expect(within(dialog).getByText('설명을 입력해 주세요.')).toBeInTheDocument()
    await waitFor(() => expect(title).toHaveFocus())

    await user.type(title, '제목 입력')
    expect(within(dialog).queryByText('제목을 입력해 주세요.')).toBeNull()
  })

  it('requires a rejection reason before rejecting', async () => {
    const user = userEvent.setup()
    const rejectSpy = vi.spyOn(dataModule, 'rejectReviewRequest').mockResolvedValue(undefined as never)

    render(
      <ReviewsPanel profile={previewLeader} data={createPreviewData()} mutate={passthroughMutate()} setData={() => undefined} />,
    )

    const detail = screen.getByRole('article')
    await user.click(within(detail).getByRole('button', { name: '반려하기' }))

    const dialog = screen.getByRole('dialog', { name: '‘파트너 API 전환 검토’를 반려할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '반려하기' }))
    expect(rejectSpy).not.toHaveBeenCalled()
    expect(within(dialog).getByText('반려 사유를 적어 주세요.')).toBeInTheDocument()

    await user.type(within(dialog).getByRole('textbox', { name: /반려 사유/ }), '표를 추가해 주세요')
    await user.click(within(dialog).getByRole('button', { name: '반려하기' }))
    await waitFor(() => expect(rejectSpy).toHaveBeenCalledWith(expect.anything(), 'review-01', '표를 추가해 주세요'))
  })

  it('approves with one toast and moves to the next pending request', async () => {
    const user = userEvent.setup()
    const mutate = passthroughMutate()

    render(
      <ReviewsPanel profile={previewLeader} data={createPreviewData()} mutate={mutate} setData={() => undefined} />,
    )

    await user.click(within(screen.getByRole('article')).getByRole('button', { name: '승인하기' }))
    const dialog = screen.getByRole('dialog', { name: '‘파트너 API 전환 검토’를 승인할까요?' })
    await user.click(within(dialog).getByRole('button', { name: '승인하기' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.any(Function), '‘파트너 API 전환 검토’를 승인했어요.'))
    const nextTitle = await screen.findByRole('heading', { level: 2, name: '모바일 알림 고도화 정책 검토' })
    await waitFor(() => expect(nextTitle).toHaveFocus())
    expect(document.querySelector('.interaction-toast, .confetti-lite')).toBeNull()
  })

  it('opens the withdraw reason prompt straight from the request', async () => {
    const user = userEvent.setup()
    const withdrawSpy = vi.spyOn(dataModule, 'withdrawReviewRequest').mockResolvedValue(undefined)
    const mutate = passthroughMutate()

    render(
      <ReviewsPanel profile={previewMember} data={memberDataWithPendingReview()} mutate={mutate} setData={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '‘수정 테스트 제목’ 더보기' }))
    await user.click(screen.getByRole('menuitem', { name: '회수하기' }))
    const dialog = screen.getByRole('dialog', { name: '‘수정 테스트 제목’을 회수할까요?' })
    await user.type(within(dialog).getByRole('textbox', { name: /회수 사유/ }), '다시 정리할게요')
    await user.click(within(dialog).getByRole('button', { name: '회수하기' }))

    await waitFor(() => expect(withdrawSpy).toHaveBeenCalledWith(expect.anything(), 'review-member-pending', '다시 정리할게요'))
    expect(mutate).toHaveBeenCalledWith(expect.any(Function), '‘수정 테스트 제목’을 회수했어요. 회수 보관함에서 볼 수 있어요.')
  })

  it('lets the member fix a rejected request and resubmit it in one action', async () => {
    const user = userEvent.setup()
    const mutate = passthroughMutate()

    render(<StatefulReviews initial={memberDataWithRejectedReview()} mutate={mutate} profile={previewMember} />)

    await user.click(screen.getByRole('button', { name: '고쳐서 다시 요청하기' }))
    const dialog = composerDialog()
    expect(within(dialog).getByText('영향 범위 표가 빠져 있어요.')).toBeInTheDocument()
    const title = within(dialog).getByLabelText(/^제목/)
    await user.clear(title)
    await user.type(title, '고친 제목')
    await user.click(within(dialog).getByRole('button', { name: '다시 요청하기' }))
    expect(within(dialog).getByText('재요청 내용을 2자 이상 적어 주세요.')).toBeInTheDocument()
    expect(mutate).not.toHaveBeenCalled()

    await user.type(within(dialog).getByRole('textbox', { name: /재요청 내용/ }), '표를 추가했어요')
    await user.click(within(dialog).getByRole('button', { name: '다시 요청하기' }))

    await waitFor(() => expect(mutate).toHaveBeenCalledWith(expect.any(Function), '‘고친 제목’을 다시 요청했어요.'))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const state = JSON.parse(screen.getByTestId('review-state').textContent ?? '[]') as Array<Partial<ReviewRequest>>
    expect(state.find((item) => item.id === 'review-member-rejected')).toEqual({
      id: 'review-member-rejected',
      title: '고친 제목',
      status: 'pending',
      review_round: 2,
    })
  })

  it('keeps feedback draft local to the selected request and submits the exact comment', async () => {
    const user = userEvent.setup()
    const data = createPreviewData()
    const feedbackSpy = vi.spyOn(dataModule, 'addReviewFeedback').mockResolvedValue(undefined as never)

    render(
      <ReviewsPanel profile={previewLeader} data={data} mutate={passthroughMutate()} setData={() => undefined} />,
    )

    const detail = screen.getByRole('article')
    const textarea = within(detail).getByPlaceholderText('요청자에게 전할 피드백을 적어 주세요')
    await user.type(textarea, '정확한 피드백')
    await user.click(within(detail).getByRole('button', { name: '피드백 남기기' }))

    expect(feedbackSpy).toHaveBeenCalledWith(expect.anything(), expect.any(String), '정확한 피드백')
    expect(textarea).toHaveValue('')
  })

  it('keeps the local draft when the feedback mutation is rejected', async () => {
    const user = userEvent.setup()
    const mutate = vi.fn(async () => false)

    render(
      <ReviewsPanel profile={previewLeader} data={createPreviewData()} mutate={mutate} setData={() => undefined} />,
    )

    const detail = screen.getByRole('article')
    const textarea = within(detail).getByPlaceholderText('요청자에게 전할 피드백을 적어 주세요')
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
    }
  })

  it('selects a deep-linked review even when a saved search would hide it', () => {
    sessionStorage.setItem('sqa.view.reviews.leader.search', JSON.stringify('존재하지 않는 검색어'))

    render(
      <ReviewsPanel
        profile={previewLeader}
        data={createPreviewData()}
        initialSelectedId="review-03"
        mutate={vi.fn()}
        setData={vi.fn()}
      />,
    )

    expect(screen.getByRole('heading', { level: 2, name: '모바일 알림 고도화 정책 검토' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: '검토요청 검색' })).toHaveValue('')
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

    render(<ReviewsPanel profile={previewLeader} data={data} mutate={passthroughMutate()} setData={() => undefined} />)

    const reopenButton = screen.getByRole('button', { name: '다시 열기' })
    await user.click(reopenButton)
    await user.click(within(screen.getByRole('dialog', { name: '‘파트너 API 전환 검토’를 다시 열까요?' })).getByRole('button', { name: '다시 열기' }))
    expect(reopenSpy).toHaveBeenCalledTimes(1)
    expect(reopenButton).toBeDisabled()

    await user.click(reopenButton)
    expect(reopenSpy).toHaveBeenCalledTimes(1)

    resolveReopen()
    await waitFor(() => expect(reopenButton).not.toBeDisabled())
  })
})
