import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge } from '../components/ui'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../types'
import type { ReviewStatusFilter, MutateFn } from '../app/types'
import {
  addReviewFeedback,
  createRepositoryContext,
  rejectReviewRequest,
  saveReviewRequest,
  updateReviewStatus,
  withdrawReviewRequest,
} from '../data'
import { UserFacingError } from '../lib/errors'
import { formatDate } from '../lib/format'
import { isReviewUnread } from '../lib/readState'
import { removeReviewAttachment, uploadReviewAttachment } from '../lib/attachments'
import {
  selectReviewStatusCounts,
  selectScopedReviewRequests,
  selectVisibleReviewRequests,
} from '../features/reviews/review.selectors'
import { ReviewDetail } from '../features/reviews/components/ReviewDetail'
import { ReviewKanban } from '../features/reviews/components/ReviewKanban'
import { ReviewList } from '../features/reviews/components/ReviewList'
import { emptyReviewForm, useReviewDraft } from '../features/reviews/useReviewDraft'
import { useReviewSelection } from '../features/reviews/useReviewSelection'
import { LayoutGrid, List, Paperclip, Send, X } from 'lucide-react'

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
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('all')
  // 칸반은 상태 흐름 전체를 보는 파트장에게 유용하다. 파트원은 목록만.
  const [reviewView, setReviewView] = useState<'list' | 'kanban'>('list')

  const scopedReviewRequests = selectScopedReviewRequests(data, profile)
  const reviewTarget = data.profiles.find((item) => item.role === 'leader')
  const statusCounts = selectReviewStatusCounts(scopedReviewRequests)
  const visibleReviewRequests = selectVisibleReviewRequests(data, profile, statusFilter)
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
  const selectReview = (id: string) => {
    const target = scopedReviewRequests.find((request) => request.id === id)
    if (target && statusFilter !== 'all' && target.status !== statusFilter) setStatusFilter('all')
    setSelectedReviewId(id)
  }

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
  } = useReviewDraft(profile.id, editingReviewId, isReviewComposerOpen)

  const isReviewSubmitDisabled =
    !form.title.trim() || !form.description.trim() || (form.deadlineMode === 'date' && !form.due_date)

  const deadlineQuickOptions = [
    { label: '오늘', days: 0 },
    { label: '내일', days: 1 },
    { label: '이번 주', days: 3 },
    { label: '다음 주', days: 7 },
  ]

  // Compute the date at click/render time (not at mount) so a composer left open past
  // midnight does not stamp yesterday's date onto "오늘".
  const quickDeadlineDate = (days: number) => {
    const date = new Date()
    date.setDate(date.getDate() + days)
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const applyQuickDeadline = (days: number) =>
    setForm((current) => ({ ...current, deadlineMode: 'date', due_date: quickDeadlineDate(days) }))

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

  useEffect(() => {
    if (!isReviewComposerOpen || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReviewComposer()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isReviewComposerOpen, closeReviewComposer])

  const preventModalFileDrop = (event: React.DragEvent) => {
    event.preventDefault()
    event.stopPropagation()
  }

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

  const rejectReview = async (requestId: string): Promise<boolean> =>
    mutate(async () => {
      const comment = feedback[requestId]?.trim()
      if (!comment) throw new UserFacingError('반려 사유를 피드백에 입력해 주세요.')
      await rejectReviewRequest(createRepositoryContext(profile, data, setData), requestId, comment)
      setFeedback((current) => ({ ...current, [requestId]: '' }))
    }, '검토요청을 반려했습니다.')

  const updateStatus = async (id: string, status: ReviewStatus): Promise<boolean> =>
    mutate(async () => {
      await updateReviewStatus(createRepositoryContext(profile, data, setData), id, status)
    }, '검토요청 상태를 변경했습니다.')

  const addFeedback = (requestId: string) =>
    mutate(async () => {
      const comment = feedback[requestId]?.trim()
      if (!comment) return
      await addReviewFeedback(createRepositoryContext(profile, data, setData), requestId, comment)
      setFeedback((current) => ({ ...current, [requestId]: '' }))
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
      {profile.role === 'member' && isReviewComposerOpen && (
        <div className="modal-backdrop" onMouseDown={() => closeReviewComposer()} role="presentation">
          <section
            aria-labelledby="review-composer-title-v2"
            aria-modal="true"
            className="modal-card review-modal modal-a"
            onDragOver={preventModalFileDrop}
            onDrop={preventModalFileDrop}
            onMouseDown={(event) => event.stopPropagation()}
            role="dialog"
          >
            <header className="modal-header modal-header-v2">
              <div className="modal-mark" aria-hidden="true">
                <Send size={18} />
              </div>
              <div>
                <span>{editingReviewId ? '검토요청 수정' : '새 검토요청'}</span>
                <h2 id="review-composer-title-v2">
                  {editingReviewId ? '요청 내용을 수정하세요' : '무엇을 검토받고 싶으세요?'}
                </h2>
              </div>
              {!editingReviewId && (
                <span className="autosave-chip" data-saved={draftSavedAt ? 'true' : 'false'}>
                  {draftSavedAt
                    ? `${draftSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 저장됨`
                    : '초안 · 저장되지 않음'}
                </span>
              )}
              <button
                aria-label="검토요청 작성 닫기"
                className="icon-button modal-close"
                onClick={() => closeReviewComposer()}
                type="button"
              >
                <X size={18} />
              </button>
            </header>
            <form
              className="review-compose-form review-compose-form-v2"
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  if (!isReviewSubmitDisabled) void createReview()
                }
              }}
              onSubmit={(event) => {
                event.preventDefault()
                if (isReviewSubmitDisabled) return
                void createReview()
              }}
            >
              <div className="review-compose-body">
                <div className="modal-field-row">
                  <label htmlFor="review-title-v2">
                    제목
                    <span>*</span>
                  </label>
                  <div>
                    <input
                      autoFocus
                      id="review-title-v2"
                      placeholder="예: 파트너 API 전환 검토"
                      value={form.title}
                      onChange={(event) => setForm({ ...form, title: event.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-field-row">
                  <label htmlFor="review-description-v2">
                    설명
                    <span>*</span>
                  </label>
                  <div>
                    <textarea
                      id="review-description-v2"
                      placeholder="검토 사유, 배경, 확인해야 할 포인트를 적어주세요."
                      value={form.description}
                      onChange={(event) => setForm({ ...form, description: event.target.value })}
                    />
                    <p>무엇을 검토받고 싶은지 파트장이 빠르게 읽을 수 있게 배경과 요청 포인트를 분리해 주세요.</p>
                  </div>
                </div>
                <div className="modal-field-row">
                  <label htmlFor="review-attachment-v2">첨부</label>
                  <div>
                    <label className="attachment-dropzone">
                      <input
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.txt,.zip"
                        hidden
                        onChange={(event) => setAttachmentFile(event.target.files?.[0] ?? null)}
                        type="file"
                      />
                      <span className="attachment-icon" aria-hidden="true">
                        <Paperclip size={16} />
                      </span>
                      <span className="attachment-copy">
                        <strong>{attachmentFile ? attachmentFile.name : '파일을 선택하세요'}</strong>
                        <small>{attachmentFile ? '선택됨 · 다시 클릭하면 변경' : 'PDF, 문서, 이미지 · 10MB 이하'}</small>
                      </span>
                      <span className="ghost compact attachment-pick">파일 선택</span>
                    </label>
                    {existingStorageAttachment && !attachmentFile && (
                      <p className="draft-notice">기존 첨부 파일이 유지됩니다.</p>
                    )}
                  </div>
                </div>
                <div className="modal-field-row">
                  <label htmlFor="review-deadline-v2">마감</label>
                  <div>
                    <div className="deadline-toggle">
                      <button
                        className={form.deadlineMode === 'none' ? 'selected' : ''}
                        onClick={() => setForm({ ...form, deadlineMode: 'none', due_date: '' })}
                        type="button"
                      >
                        기한없음
                      </button>
                      <button
                        className={form.deadlineMode === 'date' ? 'selected' : ''}
                        onClick={() => setForm({ ...form, deadlineMode: 'date' })}
                        type="button"
                      >
                        날짜 선택
                      </button>
                    </div>
                    <div className="deadline-chip-row">
                      {deadlineQuickOptions.map((option) => {
                        const optionValue = quickDeadlineDate(option.days)
                        return (
                          <button
                            className={form.deadlineMode === 'date' && form.due_date === optionValue ? 'selected' : ''}
                            key={option.label}
                            onClick={() => applyQuickDeadline(option.days)}
                            type="button"
                          >
                            <span>{option.label}</span>
                            <small>{formatDate(optionValue).slice(6)}</small>
                          </button>
                        )
                      })}
                    </div>
                    {form.deadlineMode === 'date' && (
                      <input
                        aria-label="검토 기한 날짜"
                        id="review-deadline-v2"
                        type="date"
                        value={form.due_date}
                        onChange={(event) => setForm({ ...form, due_date: event.target.value })}
                      />
                    )}
                  </div>
                </div>
                <div className="modal-field-row">
                  <span className="modal-label">요청 대상</span>
                  <div className="review-target">
                    <div>
                      <strong>{reviewTarget?.name ?? '파트장 자동 지정'}</strong>
                      <p>등록 즉시 파트장 우선처리 목록에 반영됩니다.</p>
                    </div>
                    <Badge status="pending">기본</Badge>
                  </div>
                </div>
              </div>
              <footer className="modal-footer">
                {draftNotice && <p className="draft-notice">{draftNotice}</p>}
                <span className="modal-shortcut">
                  <kbd>Ctrl</kbd>
                  <kbd>Enter</kbd>
                  보내기
                  <span>·</span>
                  <kbd>Esc</kbd>
                  닫기
                </span>
                <div>
                  {!editingReviewId && (
                    <button
                      className="ghost"
                      onClick={() => saveReviewDraft()}
                      type="button"
                    >
                      초안 저장
                    </button>
                  )}
                  <button className="ghost" onClick={() => closeReviewComposer()} type="button">
                    닫기
                  </button>
                  <button className="primary" disabled={isReviewSubmitDisabled} type="submit">
                    <Send size={16} />
                    {editingReviewId ? '수정 저장' : '검토요청 보내기'}
                  </button>
                </div>
              </footer>
            </form>
          </section>
        </div>
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
                feedback={feedback}
                onEdit={openReviewEditor}
                onWithdraw={(id) => setPendingWithdrawId(id)}
                pendingWithdrawId={pendingWithdrawId}
                profile={profile}
                rejectReview={rejectReview}
                selectedReview={selectedReview}
                setFeedback={setFeedback}
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
            feedback={feedback}
            onEdit={openReviewEditor}
            onWithdraw={(id) => setPendingWithdrawId(id)}
            pendingWithdrawId={pendingWithdrawId}
            profile={profile}
            rejectReview={rejectReview}
            selectedReview={selectedReview}
            setFeedback={setFeedback}
            updateStatus={updateStatus}
            withdrawReview={withdrawReview}
          />
        </section>
      )}
    </div>
  )
}

export { emptyReviewForm }
