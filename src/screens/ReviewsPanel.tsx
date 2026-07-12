import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../types'
import type { ReviewStatusFilter, MutateFn } from '../app/types'
import {
  addReviewFeedback,
  createRepositoryContext,
  deleteReviewFeedback,
  reopenReviewRequest,
  rejectReviewRequest,
  saveReviewRequest,
  updateReviewStatus,
  updateReviewFeedback,
  withdrawReviewRequest,
} from '../data'
import { UserFacingError } from '../lib/errors'
import { isReviewUnread } from '../lib/readState'
import { removeReviewAttachment, uploadReviewAttachment } from '../lib/attachments'
import {
  selectReviewStatusCounts,
  selectScopedReviewRequests,
  selectVisibleReviewRequests,
} from '../features/reviews/review.selectors'
import { ReviewComposerModal } from '../features/reviews/components/ReviewComposerModal'
import { ReviewDetail } from '../features/reviews/components/ReviewDetail'
import { ReviewKanban } from '../features/reviews/components/ReviewKanban'
import { ReviewList } from '../features/reviews/components/ReviewList'
import { useReviewDraft } from '../features/reviews/useReviewDraft'
import { useReviewSelection } from '../features/reviews/useReviewSelection'
import { LayoutGrid, List, Send } from 'lucide-react'

export function ReviewsPanel({
  profile,
  data,
  mutate,
  setData,
  initialSelectedId,
  onInitialSelectionApplied,
  reviewsUnreadCutoff = null,
}: {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
  /** 미확인 dot 기준 시각. App이 탭 진입 '이전' seenAt을 캡처해 내려준다. null이면 dot 없음. */
  reviewsUnreadCutoff?: string | null
}) {
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [existingStorageAttachment, setExistingStorageAttachment] = useState<string | null>(null)
  const [isReviewComposerOpen, setReviewComposerOpen] = useState(false)
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('all')
  // 칸반은 상태 흐름 전체를 보는 파트장에게 유용하다. 파트원은 목록만.
  const [reviewView, setReviewView] = useState<'list' | 'kanban'>('list')

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
        reviewsUnreadCutoff == null
          ? []
          : scopedReviewRequests
              .filter((request) => isReviewUnread(request, profile, profile.role === 'leader', reviewsUnreadCutoff))
              .map((request) => request.id),
      ),
    [profile, reviewsUnreadCutoff, scopedReviewRequests],
  )
  const { selectedReviewId, setSelectedReviewId, selectedReview } = useReviewSelection(
    visibleReviewRequests,
    scopedReviewRequests,
    initialSelectedId,
    onInitialSelectionApplied,
  )

  // 칸반 카드·딥링크는 리스트 상태 필터 밖의 요청을 가리킬 수 있다.
  // 필터 밖 요청을 선택하면 필터를 '전체'로 풀어 상세와 목록을 일치시킨다.
  const selectReview = useCallback((id: string) => {
    const target = scopedReviewRequests.find((request) => request.id === id)
    if (target && statusFilter !== 'all' && target.status !== statusFilter) setStatusFilter('all')
    setSelectedReviewId(id)
  }, [scopedReviewRequests, setSelectedReviewId, statusFilter])

  useEffect(() => {
    if (!initialSelectedId) return
    const target = scopedReviewRequests.find((request) => request.id === initialSelectedId)
    if (target && statusFilter !== 'all' && target.status !== statusFilter) setStatusFilter('all')
  }, [initialSelectedId, scopedReviewRequests, statusFilter])

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
    !form.title.trim() || !form.description.trim() || (form.deadlineMode === 'date' && !form.due_date)

  const openReviewComposer = () => {
    setEditingReviewId(null)
    setAttachmentFile(null)
    setExistingStorageAttachment(null)
    openComposerDraft()
    setReviewComposerOpen(true)
  }

  const openReviewEditor = (request: ReviewRequest) => {
    setEditingReviewId(request.id)
    setAttachmentFile(null)
    const storageAttachment = request.attachment_url?.startsWith('storage://') ? request.attachment_url : null
    setExistingStorageAttachment(storageAttachment)
    setForm({
      title: request.title,
      description: request.description,
      attachment_url: '',
      deadlineMode: request.due_date ? 'date' : 'none',
      due_date: request.due_date?.slice(0, 10) ?? '',
    })
    setDraftNotice(null)
    setReviewComposerOpen(true)
  }

  const closeReviewComposer = useCallback(() => {
      setReviewComposerOpen(false)
      setEditingReviewId(null)
      setAttachmentFile(null)
      setExistingStorageAttachment(null)
    },
    [],
  )

  const createReview = () =>
    mutate(async () => {
      const ctx = createRepositoryContext(profile, data, setData)
      const title = form.title.trim()
      const description = form.description.trim()
      if (!title || !description) {
        throw new UserFacingError('제목과 설명을 입력해 주세요.')
      }
      const dueDate = form.deadlineMode === 'date' ? form.due_date : null
      if (form.deadlineMode === 'date' && !dueDate) {
        throw new UserFacingError('검토 기한 날짜를 선택해 주세요.')
      }
      const uploadedNow = Boolean(attachmentFile) && ctx.isRemote
      const attachmentUrl = attachmentFile
        ? ctx.isRemote
          ? await uploadReviewAttachment(profile.id, attachmentFile)
          : (() => {
              throw new UserFacingError('파일 첨부는 Supabase 연결 환경에서만 사용할 수 있습니다.')
            })()
        : existingStorageAttachment
      let result: { isUpdate: boolean }
      try {
        result = await saveReviewRequest(ctx, {
          editingReviewId,
          payload: {
            title,
            description,
            attachment_url: attachmentUrl,
            due_date: dueDate,
          },
        })
      } catch (error) {
        // The record insert/update failed after we uploaded a new file — drop the orphan.
        if (uploadedNow && attachmentUrl) await removeReviewAttachment(attachmentUrl)
        throw error
      }
      if (result.isUpdate) {
        setEditingReviewId(null)
        resetForm()
        setAttachmentFile(null)
        setReviewComposerOpen(false)
        return
      }
      resetForm()
      setAttachmentFile(null)
      clearDraftStorage()
      setReviewComposerOpen(false)
    }, editingReviewId ? '검토요청을 수정했습니다.' : '검토요청을 등록했습니다.')

  const withdrawReview = (requestId: string) =>
    mutate(async () => {
      await withdrawReviewRequest(createRepositoryContext(profile, data, setData), requestId)
      setPendingWithdrawId(null)
      if (selectedReviewId === requestId) setSelectedReviewId(null)
    }, '검토요청을 회수했습니다.')

  const rejectReview = async (requestId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      const trimmedComment = comment.trim()
      if (!trimmedComment) throw new UserFacingError('반려 사유를 피드백에 입력해 주세요.')
      await rejectReviewRequest(createRepositoryContext(profile, data, setData), requestId, trimmedComment)
    }, '검토요청을 반려했습니다.')

  const updateStatus = async (id: string, status: ReviewStatus): Promise<boolean> =>
    mutate(async () => {
      await updateReviewStatus(createRepositoryContext(profile, data, setData), id, status)
    }, '검토요청 상태를 변경했습니다.')

  const reopenReview = async (id: string): Promise<boolean> =>
    mutate(async () => {
      await reopenReviewRequest(createRepositoryContext(profile, data, setData), id)
    }, '검토요청을 다시 열었습니다.')

  const updateFeedback = async (feedbackId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      await updateReviewFeedback(createRepositoryContext(profile, data, setData), feedbackId, comment)
    }, '피드백을 수정했습니다.')

  const deleteFeedback = async (feedbackId: string): Promise<boolean> =>
    mutate(async () => {
      await deleteReviewFeedback(createRepositoryContext(profile, data, setData), feedbackId)
    }, '피드백을 삭제했습니다.')

  const addFeedback = (requestId: string, comment: string): Promise<boolean> =>
    mutate(async () => {
      const trimmedComment = comment.trim()
      if (!trimmedComment) return
      await addReviewFeedback(createRepositoryContext(profile, data, setData), requestId, trimmedComment)
    }, '피드백을 남겼습니다.')

  return (
    <div className="stack review-stack">
      {profile.role === 'member' && (
        <div className="composer-callout">
          <div>
            <span>새 검토요청</span>
            <strong>{form.title || '무엇을 검토받고 싶으세요?'}</strong>
            <p>
              제목과 검토 포인트를 먼저 적고, 필요하면 첨부 파일과 기한을 더하세요. 보내는 즉시 파트장 우선처리 목록에 올라갑니다.
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
          attachmentFile={attachmentFile}
          setAttachmentFile={setAttachmentFile}
          existingStorageAttachment={existingStorageAttachment}
          reviewTargetName={reviewTarget?.name ?? null}
          isSubmitDisabled={isReviewSubmitDisabled}
          onSaveDraft={saveReviewDraft}
          onClose={closeReviewComposer}
          onSubmit={() => void createReview()}
        />
      )}
      {profile.role === 'leader' && (
        <div className="workspace-header">
          <h2>검토 워크스페이스</h2>
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
        </div>
      )}
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
                onEdit={openReviewEditor}
                onWithdraw={(id) => setPendingWithdrawId(id)}
                pendingWithdrawId={pendingWithdrawId}
                profile={profile}
                rejectReview={rejectReview}
                reopenReview={reopenReview}
                updateFeedback={updateFeedback}
                deleteFeedback={deleteFeedback}
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
            onEdit={openReviewEditor}
            onWithdraw={(id) => setPendingWithdrawId(id)}
            pendingWithdrawId={pendingWithdrawId}
            profile={profile}
            rejectReview={rejectReview}
            reopenReview={reopenReview}
            updateFeedback={updateFeedback}
            deleteFeedback={deleteFeedback}
            selectedReview={selectedReview}
            updateStatus={updateStatus}
            withdrawReview={withdrawReview}
          />
        </section>
      )}
    </div>
  )
}
