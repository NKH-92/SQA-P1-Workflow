import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../types'
import type { ReviewStatusFilter, MutateFn } from '../app/types'
import { toUserMessage, UserFacingError } from '../lib/errors'
import { REVIEW_REQUEST_LIMITS } from '../data/validation/reviews'
import { isReviewUnread } from '../lib/readState'
import {
  selectReviewStatusCounts,
  selectScopedReviewRequests,
  selectVisibleReviewRequests,
} from '../features/reviews/review.selectors'
import { ReviewComposerModal } from '../features/reviews/components/ReviewComposerModal'
import { ReviewDetail } from '../features/reviews/components/ReviewDetail'
import { ReviewKanban } from '../features/reviews/components/ReviewKanban'
import { ReviewList } from '../features/reviews/components/ReviewList'
import { ReasonPromptModal } from '../components/ui'
import { useReviewDraft } from '../features/reviews/useReviewDraft'
import { useReviewSelection } from '../features/reviews/useReviewSelection'
import { useReviewController } from '../features/reviews/useReviewController'
import { LayoutGrid, List, Send } from 'lucide-react'

export function ReviewsPanel({
  profile,
  data,
  mutate,
  setData,
  initialSelectedId,
  onInitialSelectionApplied,
}: {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
}) {
  const controller = useReviewController(profile, data, setData)
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null)
  const [withdrawDialogId, setWithdrawDialogId] = useState<string | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [isReviewComposerOpen, setReviewComposerOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('all')
  // 칸반은 상태 흐름 전체를 보는 파트장에게 유용하다. 파트원은 목록만.
  const [reviewView, setReviewView] = useState<'list' | 'kanban'>('list')
  const [archivePage, setArchivePage] = useState(-1)
  const [archiveHasMore, setArchiveHasMore] = useState(true)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const reviewDetailRef = useRef<HTMLDivElement>(null)
  const mobileDetailFrameRef = useRef<number | null>(null)

  const loadArchivePage = useCallback(async (page: number) => {
    setArchiveLoading(true)
    setArchiveError(null)
    try {
      const loadedCount = await controller.loadArchivePage(page)
      setArchivePage(page)
      setArchiveHasMore(loadedCount === 50)
    } catch (error) {
      setArchiveError(toUserMessage(error))
    } finally {
      setArchiveLoading(false)
    }
  }, [controller])

  const scopedReviewRequests = useMemo(
    () => selectScopedReviewRequests(data, profile),
    [data, profile],
  )
  const reviewTarget = useMemo(
    () => data.profiles.find((item) => item.role === 'leader'),
    [data.profiles],
  )
  const statusCounts = useMemo(
    () => selectReviewStatusCounts(scopedReviewRequests),
    [scopedReviewRequests],
  )
  const visibleReviewRequests = useMemo(
    () => selectVisibleReviewRequests(data, profile, statusFilter),
    [data, profile, statusFilter],
  )
  const unreadReviewIds = useMemo(
    () =>
      new Set(
        scopedReviewRequests
          .filter((request) => isReviewUnread(request, profile, data))
          .map((request) => request.id),
      ),
    [data, profile, scopedReviewRequests],
  )
  const { selectedReviewId, setSelectedReviewId, selectedReview } = useReviewSelection(
    visibleReviewRequests,
    initialSelectedId,
    onInitialSelectionApplied,
  )

  const openArchive = useCallback(() => {
    setStatusFilter('withdrawn')
    setReviewView('list')
    if (archivePage < 0 && !archiveLoading) void loadArchivePage(0)
  }, [archiveLoading, archivePage, loadArchivePage])

  const revealReviewDetailOnMobile = useCallback((reviewId: string) => {
    if (
      typeof window === 'undefined'
      || typeof window.matchMedia !== 'function'
      || !window.matchMedia('(max-width: 640px)').matches
    ) return

    if (mobileDetailFrameRef.current != null) {
      window.cancelAnimationFrame(mobileDetailFrameRef.current)
    }

    let remainingFrames = 2
    const reveal = () => {
      const detail = reviewDetailRef.current
      if (detail?.dataset.reviewId !== reviewId && remainingFrames > 0) {
        remainingFrames -= 1
        mobileDetailFrameRef.current = window.requestAnimationFrame(reveal)
        return
      }

      mobileDetailFrameRef.current = null
      const title = detail?.querySelector<HTMLElement>('.request-title')
      if (!detail || !title) return
      detail.scrollIntoView({ behavior: 'smooth', block: 'start' })
      title.focus({ preventScroll: true })
    }

    mobileDetailFrameRef.current = window.requestAnimationFrame(reveal)
  }, [])

  useEffect(() => () => {
    if (mobileDetailFrameRef.current != null) {
      window.cancelAnimationFrame(mobileDetailFrameRef.current)
    }
  }, [])

  // 칸반 카드·딥링크가 현재 필터 밖 요청을 가리키면 먼저 목록이 그 요청을
  // 포함하도록 전환한 뒤 선택한다. 상세는 visible collection에서만 파생된다.
  const selectReview = useCallback((id: string) => {
    const target = scopedReviewRequests.find((request) => request.id === id)
    if (!target) return
    if (target.status === 'withdrawn') {
      openArchive()
    } else if (statusFilter !== 'all' && target.status !== statusFilter) {
      setStatusFilter('all')
    }
    setSelectedReviewId(id)
    revealReviewDetailOnMobile(id)
  }, [openArchive, revealReviewDetailOnMobile, scopedReviewRequests, setSelectedReviewId, statusFilter])

  useEffect(() => {
    if (!initialSelectedId) return
    const target = scopedReviewRequests.find((request) => request.id === initialSelectedId)
    if (!target) return
    if (target.status === 'withdrawn') {
      openArchive()
    } else if (statusFilter !== 'all' && target.status !== statusFilter) {
      setStatusFilter('all')
    }
  }, [initialSelectedId, openArchive, scopedReviewRequests, statusFilter])

  const markSeenInFlightRef = useRef(new Set<string>())
  useEffect(() => {
    if (!selectedReview || !unreadReviewIds.has(selectedReview.id)) return
    const markSelectedReviewSeen = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
      if (markSeenInFlightRef.current.has(selectedReview.id)) return
      markSeenInFlightRef.current.add(selectedReview.id)
      void controller.markSeen(selectedReview.id)
        .catch(() => undefined)
        .finally(() => markSeenInFlightRef.current.delete(selectedReview.id))
    }
    markSelectedReviewSeen()
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', markSelectedReviewSeen)
    return () => document.removeEventListener('visibilitychange', markSelectedReviewSeen)
  }, [controller, selectedReview, unreadReviewIds])

  const {
    form,
    setForm,
    draftNotice,
    setDraftNotice,
    draftSavedAt,
    saveReviewDraft,
    openComposerDraft,
    clearDraftStorage,
    resetForm,
  } = useReviewDraft(profile.id)

  const isReviewSubmitDisabled =
    form.title.trim().length < REVIEW_REQUEST_LIMITS.titleMin
    || form.title.trim().length > REVIEW_REQUEST_LIMITS.titleMax
    || form.description.trim().length < REVIEW_REQUEST_LIMITS.descriptionMin
    || form.description.trim().length > REVIEW_REQUEST_LIMITS.descriptionMax
    || (form.deadlineMode === 'date' && !form.due_date)

  const openReviewComposer = () => {
    setEditingReviewId(null)
    openComposerDraft()
    setReviewComposerOpen(true)
  }

  const openReviewEditor = (request: ReviewRequest) => {
    setEditingReviewId(request.id)
    setForm({
      title: request.title,
      description: request.description,
      deadlineMode: request.due_date ? 'date' : 'none',
      due_date: request.due_date?.slice(0, 10) ?? '',
    })
    setDraftNotice(null)
    setReviewComposerOpen(true)
  }

  const closeReviewComposer = useCallback(() => {
      setReviewComposerOpen(false)
      setEditingReviewId(null)
    },
    [],
  )

  const createReview = () =>
    mutate(async () => {
      const title = form.title.trim()
      const description = form.description.trim()
      if (!title || !description) {
        throw new UserFacingError('제목과 설명을 입력해 주세요.')
      }
      const dueDate = form.deadlineMode === 'date' ? form.due_date : null
      if (form.deadlineMode === 'date' && !dueDate) {
        throw new UserFacingError('검토 기한 날짜를 선택해 주세요.')
      }
      const result = await controller.save(editingReviewId, { title, description, due_date: dueDate })
      if (result.isUpdate) {
        setEditingReviewId(null)
        resetForm()
        setReviewComposerOpen(false)
        return
      }
      resetForm()
      clearDraftStorage()
      setReviewComposerOpen(false)
    }, editingReviewId ? '검토요청을 수정했습니다.' : '검토요청을 등록했습니다.')

  const withdrawReview = (requestId: string) => {
    setWithdrawReason('')
    setWithdrawDialogId(requestId)
  }

  const confirmWithdrawReview = async () => {
    if (!withdrawDialogId || withdrawReason.trim().length < 2) return
    const requestId = withdrawDialogId
    const ok = await mutate(async () => {
      await controller.withdraw(requestId, withdrawReason.trim())
    }, '검토요청을 회수 보관함으로 옮겼습니다.')
    if (!ok) return
    setWithdrawDialogId(null)
    setWithdrawReason('')
    setPendingWithdrawId(null)
    if (selectedReviewId === requestId) setSelectedReviewId(null)
  }

  const rejectReview = async (requestId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      const trimmedComment = comment.trim()
      if (!trimmedComment) throw new UserFacingError('반려 사유를 피드백에 입력해 주세요.')
      await controller.reject(requestId, trimmedComment)
    }, '검토요청을 반려했습니다.')

  const updateStatus = async (id: string, status: ReviewStatus): Promise<boolean> =>
    mutate(async () => {
      await controller.updateStatus(id, status)
    }, '검토요청 상태를 변경했습니다.')

  const reopenReview = async (id: string): Promise<boolean> =>
    mutate(async () => {
      await controller.reopen(id)
    }, '검토요청을 다시 열었습니다.')

  const resubmitReview = async (id: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      const trimmedComment = comment.trim()
      if (!trimmedComment) throw new UserFacingError('재검토 요청 피드백을 입력해 주세요.')
      await controller.resubmit(id, trimmedComment)
    }, '같은 검토요청으로 재검토를 요청했습니다.')

  const updateFeedback = async (feedbackId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      await controller.updateFeedback(feedbackId, comment)
    }, '피드백을 수정했습니다.')

  const voidFeedback = async (feedbackId: string, reason: string): Promise<boolean> =>
    mutate(async () => {
      await controller.voidFeedback(feedbackId, reason)
    }, '피드백을 무효화했습니다.')

  const addFeedback = (requestId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      const trimmedComment = comment.trim()
      if (!trimmedComment) return
      await controller.addFeedback(requestId, trimmedComment)
    }, '피드백을 남겼습니다.')

  return (
    <div className="stack review-stack">
      {profile.role === 'member' && (
        <div className="composer-callout">
          <div>
            <span>새 검토요청</span>
            <strong>{form.title || '무엇을 검토받고 싶으세요?'}</strong>
            <p>
              제목과 검토 포인트를 먼저 적고 기한을 더하세요. 자료는 별도 메신저로 전달하고 요청 설명에 자료명을 남겨 주세요.
            </p>
          </div>
          <button className="primary" onClick={() => openReviewComposer()} type="button">
            <Send size={16} />
            검토요청 작성
          </button>
        </div>
      )}
      {profile.role === 'member' && (
        <ReviewComposerModal
          open={isReviewComposerOpen}
          editingReviewId={editingReviewId}
          form={form}
          setForm={setForm}
          draftNotice={draftNotice}
          draftSavedAt={draftSavedAt}
          reviewTargetName={reviewTarget?.name ?? null}
          isSubmitDisabled={isReviewSubmitDisabled}
          onSaveDraft={saveReviewDraft}
          onClose={closeReviewComposer}
          onSubmit={() => void createReview()}
        />
      )}
      <div className="workspace-header">
        <h2>{profile.role === 'leader' ? '검토 워크스페이스' : '내 검토 기록'}</h2>
        <button
          aria-pressed={statusFilter === 'withdrawn'}
          className={statusFilter === 'withdrawn' ? 'ghost archive-toggle selected' : 'ghost archive-toggle'}
          onClick={() => {
            const opening = statusFilter !== 'withdrawn'
            if (opening) openArchive()
            else setStatusFilter('all')
          }}
          type="button"
        >
          회수 보관함
          {archivePage >= 0 && ` (${statusCounts.withdrawn}${archiveHasMore ? '+' : ''})`}
        </button>
        {profile.role === 'leader' && (
          <div className="workspace-view-toggle" role="group" aria-label="검토요청 보기 방식">
            <button
              aria-pressed={reviewView === 'list'}
              className={reviewView === 'list' ? 'selected' : ''}
              onClick={() => setReviewView('list')}
              type="button"
            >
              <List size={14} aria-hidden="true" />
              목록
            </button>
            <button
              aria-pressed={reviewView === 'kanban'}
              className={reviewView === 'kanban' ? 'selected' : ''}
              onClick={() => setReviewView('kanban')}
              type="button"
            >
              <LayoutGrid size={14} aria-hidden="true" />
              칸반
            </button>
          </div>
        )}
      </div>
      {reviewView === 'kanban' && profile.role === 'leader' ? (
        <section className="review-workspace kanban-mode">
          <ReviewKanban
            onSelectReview={selectReview}
            requests={scopedReviewRequests}
            selectedReviewId={selectedReview?.id ?? null}
          />
          {selectedReview && (
            <div className="kanban-detail">
              <ReviewDetail
                addFeedback={addFeedback}
                detailRef={reviewDetailRef}
                localEvents={data.reviewEvents}
                onEdit={openReviewEditor}
                onWithdraw={(id) => setPendingWithdrawId(id)}
                pendingWithdrawId={pendingWithdrawId}
                profile={profile}
                rejectReview={rejectReview}
                reopenReview={reopenReview}
                resubmitReview={resubmitReview}
                updateFeedback={updateFeedback}
                voidFeedback={voidFeedback}
                selectedReview={selectedReview}
                updateStatus={updateStatus}
                withdrawReview={withdrawReview}
              />
            </div>
          )}
        </section>
      ) : (
        <section className="review-workspace">
          <ReviewList
            loading={statusFilter === 'withdrawn' && archiveLoading && archivePage < 0}
            onSelectReview={selectReview}
            onStatusFilterChange={setStatusFilter}
            profile={profile}
            scopedReviewRequests={scopedReviewRequests}
            selectedReviewId={selectedReview?.id ?? null}
            statusCounts={statusCounts}
            statusFilter={statusFilter}
            unreadIds={unreadReviewIds}
            visibleReviewRequests={visibleReviewRequests}
          />
          <ReviewDetail
            addFeedback={addFeedback}
            detailRef={reviewDetailRef}
            localEvents={data.reviewEvents}
            onEdit={openReviewEditor}
            onWithdraw={(id) => setPendingWithdrawId(id)}
            pendingWithdrawId={pendingWithdrawId}
            profile={profile}
            rejectReview={rejectReview}
            reopenReview={reopenReview}
            resubmitReview={resubmitReview}
            updateFeedback={updateFeedback}
            voidFeedback={voidFeedback}
            selectedReview={selectedReview}
            updateStatus={updateStatus}
            withdrawReview={withdrawReview}
          />
        </section>
      )}
      {statusFilter === 'withdrawn' && (
        <div className="workspace-header">
          <p className="empty-copy">최근 90일 회수 요청을 50건씩 불러옵니다.</p>
          {archiveError && <p className="notice">회수 보관함을 불러오지 못했습니다. {archiveError}</p>}
          {archiveHasMore && (
            <button className="ghost" disabled={archiveLoading} onClick={() => void loadArchivePage(archivePage + 1)} type="button">
              {archiveLoading ? '불러오는 중...' : '이전 회수 요청 더 보기'}
            </button>
          )}
        </div>
      )}
      <ReasonPromptModal
        description="요청은 삭제되지 않고 회수 보관함에 보존됩니다."
        maxLength={500}
        minLength={2}
        onClose={() => {
          setWithdrawDialogId(null)
          setWithdrawReason('')
        }}
        onSubmit={() => void confirmWithdrawReview()}
        open={Boolean(withdrawDialogId)}
        reason={withdrawReason}
        setReason={setWithdrawReason}
        submitLabel="회수하기"
        title="검토요청을 회수할까요?"
      />
    </div>
  )
}
