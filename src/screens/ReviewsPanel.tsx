import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppData, Profile, ReviewRequest } from '../types'
import type { ReviewStatusFilter, MutateFn } from '../app/types'
import { toUserMessage } from '../lib/errors'
import { quotedWithJosa } from '../lib/korean'
import { isReviewUnread } from '../lib/readState'
import { isLeaderDefaultReviewRequest, matchesReviewSearch } from '../lib/reviewHistory'
import { preferredScrollBehavior } from '../lib/motion'
import {
  selectDefaultReviewRequests,
  selectNextPendingReviewId,
  selectReviewStatusCounts,
  selectScopedReviewRequests,
  selectVisibleReviewRequests,
} from '../features/reviews/review.selectors'
import {
  buildDecisionEventIndex,
  DEFAULT_REVIEW_SORT_MODE,
  isReviewSortMode,
  type ReviewSortMode,
} from '../features/reviews/reviewOrdering'
import { latestLeaderFeedback } from '../features/reviews/reviewRequestItemModel'
import {
  ReviewComposerModal,
  type ReviewComposerMode,
} from '../features/reviews/components/ReviewComposerModal'
import { ReviewDetail } from '../features/reviews/components/ReviewDetail'
import { ReviewKanban } from '../features/reviews/components/ReviewKanban'
import { ReviewList } from '../features/reviews/components/ReviewList'
import { ReviewHistoryModal } from '../features/reviews/components/ReviewHistoryModal'
import { ReasonPromptModal } from '../components/ui'
import { emptyReviewForm, useReviewDraft, type ReviewFormState } from '../features/reviews/useReviewDraft'
import { useReviewSelection } from '../features/reviews/useReviewSelection'
import { useReviewController } from '../features/reviews/useReviewController'
import { REVIEW_COMPACT_QUERY, useMediaQuery } from '../features/reviews/useMediaQuery'
import { isMobileDetailViewport, useMobileDetail } from '../hooks/useMobileDetail'
import { useViewState } from '../hooks/useViewState'
import { useComposerIntent } from '../app/hooks/useComposerIntent'
import { useSelectionHashSync } from '../app/hooks/useHashNavigation'
import { Archive, LayoutGrid, List, Search, Send } from 'lucide-react'
import { canViewTeamData } from '../domain/permissions'

type ReviewsPanelProps = {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
}

type ComposerState =
  | { mode: 'new' }
  | { mode: Exclude<ReviewComposerMode, 'new'>; request: ReviewRequest }
  | null

type ReviewViewMode = 'list' | 'kanban'

const REVIEW_STATUS_FILTERS: ReadonlyArray<ReviewStatusFilter> = ['all', 'pending', 'approved', 'rejected', 'withdrawn']

function isReviewStatusFilter(value: unknown): value is ReviewStatusFilter {
  return typeof value === 'string' && (REVIEW_STATUS_FILTERS as ReadonlyArray<string>).includes(value)
}

function isReviewViewMode(value: unknown): value is ReviewViewMode {
  return value === 'list' || value === 'kanban'
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function formFromRequest(request: ReviewRequest): ReviewFormState {
  return {
    title: request.title,
    description: request.description,
    deadlineMode: request.due_date ? 'date' : 'none',
    due_date: request.due_date?.slice(0, 10) ?? '',
  }
}

function sameForm(left: ReviewFormState, right: ReviewFormState) {
  return left.title === right.title
    && left.description === right.description
    && left.deadlineMode === right.deadlineMode
    && (left.deadlineMode === 'none' || left.due_date === right.due_date)
}

function payloadFromForm(form: ReviewFormState) {
  return {
    title: form.title.trim(),
    description: form.description.trim(),
    due_date: form.deadlineMode === 'date' ? form.due_date : null,
  }
}

/** 역할이 바뀌면(미리보기 역할 전환 등) 보기 상태와 작성 중 상태를 새로 시작한다. */
export function ReviewsPanel(props: ReviewsPanelProps) {
  return <ReviewsWorkspace key={props.profile.id} {...props} />
}

function ReviewsWorkspace({
  profile,
  data,
  mutate,
  setData,
  initialSelectedId,
  onInitialSelectionApplied,
}: ReviewsPanelProps) {
  const controller = useReviewController(profile, data, setData)
  const leaderMode = canViewTeamData(profile)
  const roleKey = leaderMode ? 'leader' : 'member'
  const [statusFilter, setStatusFilter] = useViewState<ReviewStatusFilter>(
    `reviews.${roleKey}.status`,
    'all',
    isReviewStatusFilter,
  )
  const [searchQuery, setSearchQuery] = useViewState<string>(`reviews.${roleKey}.search`, '', isString)
  // 칸반은 상태 흐름 전체를 보는 파트장에게 유용하다. 파트원은 목록만.
  const [storedReviewView, setReviewView] = useViewState<ReviewViewMode>('reviews.leader.view', 'list', isReviewViewMode)
  const [sortMode, setSortMode] = useViewState<ReviewSortMode>(
    'reviews.leader.sort',
    DEFAULT_REVIEW_SORT_MODE,
    isReviewSortMode,
  )
  const selectionState = useViewState<string | null>(`reviews.${roleKey}.selection`, null, isNullableString)
  const reviewView: ReviewViewMode = leaderMode ? storedReviewView : 'list'

  const [composer, setComposer] = useState<ComposerState>(null)
  const [editForm, setEditForm] = useState<ReviewFormState>(emptyReviewForm)
  const [editBaseline, setEditBaseline] = useState<ReviewFormState>(emptyReviewForm)
  const [resubmitNote, setResubmitNote] = useState('')
  const [composerSubmitting, setComposerSubmitting] = useState(false)
  const [withdrawTarget, setWithdrawTarget] = useState<ReviewRequest | null>(null)
  const [withdrawReason, setWithdrawReason] = useState('')
  const [withdrawSubmitting, setWithdrawSubmitting] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyInitialRequest, setHistoryInitialRequest] = useState<ReviewRequest | null>(null)
  const [archivePage, setArchivePage] = useState(-1)
  const [archiveHasMore, setArchiveHasMore] = useState(true)
  const [archiveLoading, setArchiveLoading] = useState(false)
  const [archiveError, setArchiveError] = useState<string | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const compact = useMediaQuery(REVIEW_COMPACT_QUERY)
  const rootRef = useRef<HTMLDivElement>(null)
  const reviewDetailRef = useRef<HTMLDivElement>(null)
  const archiveRequestedRef = useRef(false)
  const titleFocusTargetRef = useRef<string | null>(null)

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
  const defaultReviewRequests = useMemo(
    () => selectDefaultReviewRequests(data, profile),
    [data, profile],
  )
  const reviewTarget = useMemo(
    () => data.profiles.find((item) => item.role === 'leader'),
    [data.profiles],
  )
  const statusCounts = useMemo(
    () => selectReviewStatusCounts(defaultReviewRequests),
    [defaultReviewRequests],
  )
  const visibleReviewRequests = useMemo(
    () => selectVisibleReviewRequests(
      data,
      profile,
      statusFilter,
      leaderMode ? searchQuery : '',
      undefined,
      leaderMode ? sortMode : null,
    ),
    [data, leaderMode, profile, searchQuery, sortMode, statusFilter],
  )
  const decisionEvents = useMemo(() => buildDecisionEventIndex(data.reviewEvents ?? []), [data.reviewEvents])
  const unreadReviewIds = useMemo(
    () =>
      new Set(
        defaultReviewRequests
          .filter((request) => isReviewUnread(request, profile, data))
          .map((request) => request.id),
      ),
    [data, defaultReviewRequests, profile],
  )
  const { selectedReviewId, setSelectedReviewId, selectedReview } = useReviewSelection(
    visibleReviewRequests,
    initialSelectedId,
    onInitialSelectionApplied,
    selectionState,
  )

  const openArchive = useCallback(() => {
    setStatusFilter('withdrawn')
    setReviewView('list')
    if (archivePage < 0 && !archiveLoading && !archiveRequestedRef.current) {
      archiveRequestedRef.current = true
      void loadArchivePage(0)
    }
  }, [archiveLoading, archivePage, loadArchivePage, setReviewView, setStatusFilter])

  // 회수 보관함을 보던 파트원이 다른 메뉴에 다녀오면 보관함 첫 페이지를 다시 불러온다.
  useEffect(() => {
    if (leaderMode || statusFilter !== 'withdrawn' || archiveRequestedRef.current) return
    archiveRequestedRef.current = true
    void loadArchivePage(0)
  }, [leaderMode, loadArchivePage, statusFilter])

  const openHistory = useCallback((request: ReviewRequest | null = null) => {
    setHistoryInitialRequest(request)
    setHistoryOpen(true)
  }, [])

  const focusSelectedListItem = useCallback(() => {
    window.setTimeout(() => {
      const item = rootRef.current?.querySelector<HTMLElement>('.review-list-item.selected, .kanban-card.selected')
      if (!item) return
      item.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest' })
      item.focus({ preventScroll: true })
    }, 0)
  }, [])

  const closeMobileDetail = useCallback(() => {
    setMobileDetailOpen(false)
    focusSelectedListItem()
  }, [focusSelectedListItem])

  // 좁은 화면(≤980px): 항목을 고르면 상세를 화면 위로 가져와 제목에 포커스하고, 뒤로가기는 목록으로 돌아간다.
  useMobileDetail({
    open: mobileDetailOpen,
    detailRef: reviewDetailRef,
    onBack: closeMobileDetail,
    selectionKey: selectedReview?.id ?? null,
    headingSelector: '.request-title',
  })

  // 결정 뒤 다음 요청으로 넘어가면 그 제목으로 포커스를 옮긴다(키보드·보조기기 사용자가 이어서 처리하도록).
  useEffect(() => {
    const targetId = titleFocusTargetRef.current
    if (!targetId || selectedReview?.id !== targetId) return
    titleFocusTargetRef.current = null
    const timer = window.setTimeout(() => {
      const detail = reviewDetailRef.current
      if (detail?.dataset.reviewId !== targetId) return
      detail.querySelector<HTMLElement>('.request-title')?.focus({ preventScroll: isMobileDetailViewport() })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [selectedReview?.id])

  // 칸반 카드·딥링크가 현재 필터 밖 요청을 가리키면 먼저 목록이 그 요청을
  // 포함하도록 전환한 뒤 선택한다. 상세는 visible collection에서만 파생된다.
  const revealTarget = useCallback((target: ReviewRequest) => {
    if (profile.role === 'member' && target.status === 'withdrawn') {
      openArchive()
    } else if (statusFilter !== 'all' && target.status !== statusFilter) {
      setStatusFilter('all')
    }
    if (leaderMode && !matchesReviewSearch(target, searchQuery)) setSearchQuery('')
  }, [leaderMode, openArchive, profile.role, searchQuery, setSearchQuery, setStatusFilter, statusFilter])

  const selectReview = useCallback((id: string) => {
    const target = scopedReviewRequests.find((request) => request.id === id)
    if (!target) return
    if (leaderMode && !isLeaderDefaultReviewRequest(target)) {
      openHistory(target)
      return
    }
    revealTarget(target)
    setSelectedReviewId(id)
    if (isMobileDetailViewport()) setMobileDetailOpen(true)
  }, [leaderMode, openHistory, revealTarget, scopedReviewRequests, setSelectedReviewId])

  useEffect(() => {
    if (!initialSelectedId) return
    const target = scopedReviewRequests.find((request) => request.id === initialSelectedId)
    if (!target) return
    if (leaderMode && !isLeaderDefaultReviewRequest(target)) {
      openHistory(target)
      onInitialSelectionApplied?.()
      return
    }
    revealTarget(target)
    if (isMobileDetailViewport()) setMobileDetailOpen(true)
  }, [initialSelectedId, leaderMode, onInitialSelectionApplied, openHistory, revealTarget, scopedReviewRequests])

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
    form: draftForm,
    setForm: setDraftForm,
    draftNotice,
    draftSavedAt,
    hasUnsavedChanges: draftPending,
    flushDraft,
    openComposerDraft,
    discardDraft,
  } = useReviewDraft(profile.id)

  const openNewComposer = () => {
    openComposerDraft()
    setComposer({ mode: 'new' })
  }

  // 홈의 ‘검토요청 쓰기’ 같은 다른 화면의 요청으로도 작성 창을 연다.
  useComposerIntent('reviews', openNewComposer, profile.role === 'member')
  // 고른 요청을 주소(?id=)에 맞춰 둬 새로고침·공유·뒤로가기에도 같은 요청으로 돌아온다.
  useSelectionHashSync('reviews', initialSelectedId ? undefined : selectedReview?.id ?? null)

  const openRequestComposer = (request: ReviewRequest, mode: 'edit' | 'resubmit') => {
    const form = formFromRequest(request)
    setEditForm(form)
    setEditBaseline(form)
    setResubmitNote('')
    setComposer({ mode, request })
  }

  const closeComposer = useCallback(() => {
    if (composer?.mode === 'new') flushDraft()
    setComposer(null)
  }, [composer?.mode, flushDraft])

  const submitComposer = async () => {
    if (!composer || composerSubmitting) return
    const form = composer.mode === 'new' ? draftForm : editForm
    const payload = payloadFromForm(form)
    setComposerSubmitting(true)
    try {
      if (composer.mode === 'new') {
        await mutate(async () => {
          await controller.save(null, payload)
          discardDraft()
          setComposer(null)
        }, `${quotedWithJosa(payload.title, '을/를')} 보냈어요.`)
        return
      }
      const request = composer.request
      if (composer.mode === 'edit') {
        await mutate(async () => {
          await controller.save(request.id, payload)
          setComposer(null)
        }, `${quotedWithJosa(payload.title, '을/를')} 수정했어요.`)
        return
      }
      await mutate(async () => {
        await controller.resubmitWithEdits(request.id, payload, resubmitNote.trim())
        setComposer(null)
      }, `${quotedWithJosa(payload.title, '을/를')} 다시 요청했어요.`)
    } finally {
      setComposerSubmitting(false)
    }
  }

  const composerMode: ReviewComposerMode = composer?.mode ?? 'new'
  const composerForm = composerMode === 'new' ? draftForm : editForm
  const setComposerForm = composerMode === 'new' ? setDraftForm : setEditForm
  const composerRequest = composer && composer.mode !== 'new' ? composer.request : null
  const composerDirty = composerMode !== 'new'
    && (!sameForm(editForm, editBaseline) || resubmitNote.trim().length > 0)

  const withdrawReview = (request: ReviewRequest) => {
    setWithdrawReason('')
    setWithdrawTarget(request)
  }

  const confirmWithdrawReview = async () => {
    if (!withdrawTarget || withdrawReason.trim().length < 2 || withdrawSubmitting) return
    const target = withdrawTarget
    setWithdrawSubmitting(true)
    const ok = await mutate(async () => {
      await controller.withdraw(target.id, withdrawReason.trim())
    }, `${quotedWithJosa(target.title, '을/를')} 회수했어요. 회수 보관함에서 볼 수 있어요.`)
    setWithdrawSubmitting(false)
    if (!ok) return
    setWithdrawTarget(null)
    setWithdrawReason('')
    if (selectedReviewId === target.id) setSelectedReviewId(null)
  }

  /** 승인·반려 뒤: 지금 순서·필터에서 다음 대기 중 요청을 고르고 그 제목에 포커스한다. */
  const advanceAfterDecision = (decidedId: string, order: ReadonlyArray<ReviewRequest>) => {
    const nextId = selectNextPendingReviewId(order, decidedId)
    if (!nextId) return
    titleFocusTargetRef.current = nextId
    setSelectedReviewId(nextId)
  }

  const approveReview = async (request: ReviewRequest): Promise<boolean> => {
    const order = visibleReviewRequests
    const ok = await mutate(async () => {
      await controller.updateStatus(request.id, 'approved')
    }, `${quotedWithJosa(request.title, '을/를')} 승인했어요.`)
    if (ok) advanceAfterDecision(request.id, order)
    return ok
  }

  const rejectReview = async (request: ReviewRequest, reason: string): Promise<boolean> => {
    const order = visibleReviewRequests
    const ok = await mutate(async () => {
      await controller.reject(request.id, reason.trim())
    }, `${quotedWithJosa(request.title, '을/를')} 반려했어요.`)
    if (ok) advanceAfterDecision(request.id, order)
    return ok
  }

  const reopenReview = async (request: ReviewRequest): Promise<boolean> => {
    const ok = await mutate(async () => {
      await controller.reopen(request.id)
    }, `${quotedWithJosa(request.title, '을/를')} 다시 열었어요.`)
    if (ok) {
      setSearchQuery('')
      setStatusFilter('all')
      setSelectedReviewId(request.id)
    }
    return ok
  }

  const updateFeedback = async (feedbackId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      await controller.updateFeedback(feedbackId, comment)
    }, '피드백을 수정했어요.')

  const voidFeedback = async (feedbackId: string, reason: string): Promise<boolean> =>
    mutate(async () => {
      await controller.voidFeedback(feedbackId, reason)
    }, '피드백을 무효화했어요.')

  const addFeedback = (requestId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      const trimmedComment = comment.trim()
      if (!trimmedComment) return
      await controller.addFeedback(requestId, trimmedComment)
    }, '피드백을 남겼어요.')

  const detailHandlers = {
    onApprove: approveReview,
    onReject: rejectReview,
    onReopen: reopenReview,
    onEdit: (request: ReviewRequest) => openRequestComposer(request, 'edit'),
    onResubmit: (request: ReviewRequest) => openRequestComposer(request, 'resubmit'),
    onWithdraw: withdrawReview,
    addFeedback,
    updateFeedback,
    voidFeedback,
  }

  const detail = (
    <ReviewDetail
      {...detailHandlers}
      // 휴대폰에서 상세를 연 동안에만 처리 버튼을 화면 아래 줄로 옮긴다(목록을 볼 때는 하단 탭바를 가리지 않게).
      compact={compact && mobileDetailOpen}
      detailRef={reviewDetailRef}
      localEvents={data.reviewEvents}
      onBackToList={mobileDetailOpen ? closeMobileDetail : undefined}
      profile={profile}
      selectedReview={selectedReview}
    />
  )

  const draftHasContent = Boolean(draftForm.title.trim() || draftForm.description.trim())

  return (
    <div
      className="stack review-stack"
      data-mobile-detail={mobileDetailOpen ? 'open' : undefined}
      ref={rootRef}
    >
      {profile.role === 'member' && (
        <div className="composer-callout">
          <div>
            <span>새 검토요청</span>
            <strong>{draftForm.title.trim() || '어떤 검토가 필요한가요?'}</strong>
            <p>
              {draftHasContent
                ? '쓰던 검토요청이 있어요. 이어서 쓰고 보내 주세요.'
                : '제목과 검토할 점을 적고 기한을 정해 주세요. 자료는 메신저로 따로 보내고, 설명에 자료 이름을 남겨 주세요.'}
            </p>
          </div>
          <button className="primary" onClick={() => openNewComposer()} type="button">
            <Send size={16} aria-hidden="true" />
            검토요청 쓰기
          </button>
        </div>
      )}
      {profile.role === 'member' && (
        <ReviewComposerModal
          autosavePending={draftPending}
          dirty={composerDirty}
          draftNotice={composerMode === 'new' ? draftNotice : null}
          draftSavedAt={composerMode === 'new' ? draftSavedAt : null}
          form={composerForm}
          mode={composerMode}
          note={resubmitNote}
          onClose={closeComposer}
          onSubmit={() => void submitComposer()}
          open={composer !== null}
          originalDueDate={composerRequest?.due_date ?? null}
          rejectionReason={composerRequest ? latestLeaderFeedback(composerRequest)?.comment ?? null : null}
          reviewTargetName={reviewTarget?.name ?? null}
          setForm={setComposerForm}
          setNote={setResubmitNote}
          submitting={composerSubmitting}
        />
      )}
      <div className="workspace-header">
        <h1 className="workspace-title">{leaderMode ? '검토요청' : '내 검토요청'}</h1>
        {leaderMode ? (
          <label className="search-field review-workspace-search">
            <Search size={15} aria-hidden="true" />
            <input
              aria-label="검토요청 검색"
              maxLength={200}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="제목, 설명, 요청자로 찾기"
              type="search"
              value={searchQuery}
            />
          </label>
        ) : (
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
        )}
        {leaderMode && (
          <div className="workspace-header-actions">
            <button className="ghost" onClick={() => openHistory()} type="button">
              <Archive size={15} aria-hidden="true" />
              검토 이력
            </button>
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
                onClick={() => {
                  setStatusFilter('all')
                  setReviewView('kanban')
                }}
                type="button"
              >
                <LayoutGrid size={14} aria-hidden="true" />
                칸반
              </button>
            </div>
          </div>
        )}
      </div>
      {reviewView === 'kanban' ? (
        <section aria-label="검토요청 칸반" className="review-workspace kanban-mode">
          <ReviewKanban
            decisionEvents={decisionEvents}
            onSelectReview={selectReview}
            requests={visibleReviewRequests}
            selectedReviewId={selectedReview?.id ?? null}
          />
          {selectedReview && <div className="kanban-detail">{detail}</div>}
        </section>
      ) : (
        <section aria-label="검토요청 작업 공간" className="review-workspace">
          <ReviewList
            decisionEvents={decisionEvents}
            loading={statusFilter === 'withdrawn' && archiveLoading && archivePage < 0}
            onSelectReview={selectReview}
            onSortModeChange={leaderMode ? setSortMode : undefined}
            onStatusFilterChange={setStatusFilter}
            profile={profile}
            scopedReviewRequests={defaultReviewRequests}
            selectedReviewId={selectedReview?.id ?? null}
            sortMode={leaderMode ? sortMode : undefined}
            statusCounts={statusCounts}
            statusFilter={statusFilter}
            unreadIds={unreadReviewIds}
            visibleReviewRequests={visibleReviewRequests}
          />
          {detail}
        </section>
      )}
      {profile.role === 'member' && statusFilter === 'withdrawn' && (
        <div className="workspace-header review-archive-foot">
          <p className="empty-copy">최근 90일 동안 회수한 요청을 50건씩 보여 줘요.</p>
          {archiveError && (
            <p className="notice" role="alert">
              회수 보관함을 불러오지 못했어요. {archiveError}
            </p>
          )}
          {archiveError ? (
            <button
              className="ghost"
              disabled={archiveLoading}
              onClick={() => void loadArchivePage(Math.max(archivePage + 1, 0))}
              type="button"
            >
              다시 시도
            </button>
          ) : archiveHasMore && (
            <button className="ghost" disabled={archiveLoading} onClick={() => void loadArchivePage(archivePage + 1)} type="button">
              {archiveLoading ? '불러오는 중…' : '회수한 요청 더 보기'}
            </button>
          )}
        </div>
      )}
      {leaderMode && (
        <ReviewHistoryModal
          initialRequest={historyInitialRequest}
          localEvents={data.reviewEvents}
          onClose={() => {
            setHistoryOpen(false)
            setHistoryInitialRequest(null)
          }}
          onLoadPage={controller.loadHistoryPage}
          onReopen={reopenReview}
          open={historyOpen}
          profile={profile}
        />
      )}
      <ReasonPromptModal
        description="회수해도 요청은 삭제되지 않아요. 회수 보관함에서 다시 볼 수 있어요."
        label="회수 사유"
        maxLength={500}
        minLength={2}
        onClose={() => {
          setWithdrawTarget(null)
          setWithdrawReason('')
        }}
        onSubmit={() => void confirmWithdrawReview()}
        open={Boolean(withdrawTarget)}
        placeholder="예: 요청 내용을 다시 정리할게요"
        reason={withdrawReason}
        setReason={setWithdrawReason}
        submitLabel="회수하기"
        submitting={withdrawSubmitting}
        title={withdrawTarget ? `${quotedWithJosa(withdrawTarget.title, '을/를')} 회수할까요?` : '검토요청을 회수할까요?'}
      />
    </div>
  )
}
