import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge } from '../components/ui'
import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../types'
import type { DeadlineMode, ReviewStatusFilter } from '../app/types'
import {
  addReviewFeedback,
  createRepositoryContext,
  rejectReviewRequest,
  saveReviewRequest,
  updateReviewStatus,
  withdrawReviewRequest,
} from '../data'
import { normalizeHttpUrl } from '../lib/urls'
import { formatDate, reviewStatusLabels } from '../lib/format'
import { uploadReviewAttachment } from '../lib/attachments'
import { compareReviewRequests } from '../lib/priority'
import { ageInDays, dueDateLabel, dueDateStatus } from '../lib/dates'
import { ReviewRequestItem } from './ReviewRequestItem'
import {
  Paperclip,
  Send,
  X,
} from 'lucide-react'

const emptyReviewForm = {
  title: '',
  description: '',
  attachment_url: '',
  deadlineMode: 'none' as DeadlineMode,
  due_date: '',
}

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
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
}) {
  const [form, setForm] = useState(emptyReviewForm)
  const [editingReviewId, setEditingReviewId] = useState<string | null>(null)
  const [pendingWithdrawId, setPendingWithdrawId] = useState<string | null>(null)
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [isReviewComposerOpen, setReviewComposerOpen] = useState(false)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [draftSavedAt, setDraftSavedAt] = useState<Date | null>(null)
  const [feedback, setFeedback] = useState<Record<string, string>>({})
  const [statusFilter, setStatusFilter] = useState<ReviewStatusFilter>('all')
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null)
  const scopedReviewRequests =
    profile.role === 'leader' ? data.reviewRequests : data.reviewRequests.filter((request) => request.requester_id === profile.id)
  const reviewTarget = data.profiles.find((item) => item.role === 'leader')
  const statusCounts = scopedReviewRequests.reduce(
    (counts, request) => ({
      ...counts,
      [request.status]: counts[request.status] + 1,
    }),
    { pending: 0, approved: 0, rejected: 0 } satisfies Record<ReviewStatus, number>,
  )
  const visibleReviewRequests = (
    statusFilter === 'all' ? scopedReviewRequests : scopedReviewRequests.filter((request) => request.status === statusFilter)
  ).sort((left, right) => compareReviewRequests(left, right, profile.role === 'member'))
  const firstVisibleReviewId = visibleReviewRequests[0]?.id ?? null
  const visibleReviewKey = visibleReviewRequests.map((request) => request.id).join('|')
  const selectedReview = visibleReviewRequests.find((request) => request.id === selectedReviewId) ?? visibleReviewRequests[0] ?? null
  const isReviewSubmitDisabled = !form.title.trim() || !form.description.trim() || (form.deadlineMode === 'date' && !form.due_date)
  const deadlineQuickOptions = useMemo(() => {
    const today = new Date()
    const toInputDate = (date: Date) => {
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      const day = String(date.getDate()).padStart(2, '0')
      return `${year}-${month}-${day}`
    }
    const addDays = (days: number) => {
      const date = new Date(today)
      date.setDate(today.getDate() + days)
      return toInputDate(date)
    }
    return [
      { label: '오늘', value: addDays(0) },
      { label: '내일', value: addDays(1) },
      { label: '이번 주', value: addDays(3) },
      { label: '다음 주', value: addDays(7) },
    ]
  }, [])
  const applyQuickDeadline = (value: string) =>
    setForm((current) => ({ ...current, deadlineMode: 'date', due_date: value }))

  const reviewDraftKey = `draft:review:${profile.id}`

  const saveReviewDraft = useCallback(() => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(reviewDraftKey, JSON.stringify(form))
    setDraftSavedAt(new Date())
  }, [form, reviewDraftKey])

  const openReviewComposer = () => {
    setEditingReviewId(null)
    setAttachmentFile(null)
    setDraftSavedAt(null)
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(reviewDraftKey)
      if (raw) {
        try {
          setForm(JSON.parse(raw) as typeof form)
          setDraftNotice('이 기기에 저장된 초안을 불러왔습니다.')
        } catch {
          setForm(emptyReviewForm)
          setDraftNotice(null)
        }
      } else {
        setForm(emptyReviewForm)
        setDraftNotice(null)
      }
    } else {
      setForm(emptyReviewForm)
      setDraftNotice(null)
    }
    setReviewComposerOpen(true)
  }

  const openReviewEditor = (request: ReviewRequest) => {
    setEditingReviewId(request.id)
    setAttachmentFile(null)
    setForm({
      title: request.title,
      description: request.description,
      attachment_url: request.attachment_url ?? '',
      deadlineMode: request.due_date ? 'date' : 'none',
      due_date: request.due_date?.slice(0, 10) ?? '',
    })
    setDraftNotice(null)
    setReviewComposerOpen(true)
  }

  const closeReviewComposer = useCallback(
    (saveDraft = false) => {
      if (saveDraft && !editingReviewId) saveReviewDraft()
      setReviewComposerOpen(false)
      setEditingReviewId(null)
      setAttachmentFile(null)
    },
    [editingReviewId, saveReviewDraft],
  )

  useEffect(() => {
    if (!isReviewComposerOpen || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeReviewComposer(true)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isReviewComposerOpen, closeReviewComposer])

  useEffect(() => {
    if (!firstVisibleReviewId) {
      if (selectedReviewId !== null) setSelectedReviewId(null)
      return
    }
    if (!visibleReviewRequests.some((request) => request.id === selectedReviewId)) {
      setSelectedReviewId(firstVisibleReviewId)
    }
  }, [firstVisibleReviewId, selectedReviewId, visibleReviewKey, visibleReviewRequests])

  useEffect(() => {
    if (!initialSelectedId) return
    if (!scopedReviewRequests.some((request) => request.id === initialSelectedId)) return
    setSelectedReviewId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, onInitialSelectionApplied, scopedReviewRequests])

  useEffect(() => {
    if (!isReviewComposerOpen || editingReviewId) return
    const timer = setTimeout(() => saveReviewDraft(), 1000)
    return () => clearTimeout(timer)
  }, [form, isReviewComposerOpen, editingReviewId, saveReviewDraft])

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
        throw new Error('제목과 설명을 입력해 주세요.')
      }
      const attachmentUrl = attachmentFile
        ? ctx.isRemote
          ? await uploadReviewAttachment(profile.id, attachmentFile)
          : (() => {
              throw new Error('파일 첨부는 Supabase 연결 환경에서만 사용할 수 있습니다.')
            })()
        : normalizeHttpUrl(form.attachment_url)
      if (!attachmentFile && form.attachment_url.trim() && !attachmentUrl) {
        throw new Error('첨부 링크는 http 또는 https URL만 사용할 수 있습니다.')
      }
      const dueDate = form.deadlineMode === 'date' ? form.due_date : null
      if (form.deadlineMode === 'date' && !dueDate) {
        throw new Error('검토 기한 날짜를 선택해 주세요.')
      }
      const { isUpdate } = await saveReviewRequest(ctx, {
        editingReviewId,
        payload: {
          title,
          description,
          attachment_url: attachmentUrl,
          due_date: dueDate,
        },
      })
      if (isUpdate) {
        setEditingReviewId(null)
        setForm(emptyReviewForm)
        setAttachmentFile(null)
        setReviewComposerOpen(false)
        return
      }
      setForm(emptyReviewForm)
      setAttachmentFile(null)
      if (typeof localStorage !== 'undefined') localStorage.removeItem(reviewDraftKey)
      setDraftNotice(null)
      setReviewComposerOpen(false)
    }, editingReviewId ? '검토요청을 수정했습니다.' : '검토요청을 등록했습니다.')

  const withdrawReview = (requestId: string) =>
    mutate(async () => {
      await withdrawReviewRequest(createRepositoryContext(profile, data, setData), requestId)
      setPendingWithdrawId(null)
      if (selectedReviewId === requestId) setSelectedReviewId(null)
    }, '검토요청을 회수했습니다.')

  const rejectReview = (requestId: string) =>
    mutate(async () => {
      const comment = feedback[requestId]?.trim()
      if (!comment) throw new Error('반려 사유를 피드백에 입력해 주세요.')
      await rejectReviewRequest(createRepositoryContext(profile, data, setData), requestId, comment)
      setFeedback((current) => ({ ...current, [requestId]: '' }))
    }, '검토요청을 반려했습니다.')

  const updateStatus = (id: string, status: ReviewStatus) =>
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
              제목과 검토 포인트를 먼저 적고, 필요하면 첨부 링크와 기한을 더하세요. 보내는 즉시 파트장 우선처리 목록에 올라갑니다.
            </p>
          </div>
          <button className="primary" onClick={() => openReviewComposer()} type="button">
            <Send size={16} />
            검토요청 작성
          </button>
        </div>
      )}
      {profile.role === 'member' && isReviewComposerOpen && (
        <div className="modal-backdrop" onMouseDown={() => closeReviewComposer(true)} role="presentation">
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
                    ? `${draftSavedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 자동저장됨`
                    : '초안 · 저장되지 않음'}
                </span>
              )}
              <button
                aria-label="검토요청 작성 닫기"
                className="icon-button modal-close"
                onClick={() => closeReviewComposer(true)}
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
                        <strong>{attachmentFile ? attachmentFile.name : '파일을 선택하거나 아래에 링크를 붙여넣으세요'}</strong>
                        <small>{attachmentFile ? '선택됨 · 다시 클릭하면 변경' : 'PDF, 문서, 이미지 · 10MB 이하'}</small>
                      </span>
                      <span className="ghost compact attachment-pick">파일 선택</span>
                    </label>
                    <input
                      aria-label="첨부 링크(URL)"
                      id="review-attachment-v2"
                      placeholder="https:// 링크 첨부"
                      value={form.attachment_url}
                      onChange={(event) => setForm({ ...form, attachment_url: event.target.value })}
                    />
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
                      {deadlineQuickOptions.map((option) => (
                        <button
                          className={form.deadlineMode === 'date' && form.due_date === option.value ? 'selected' : ''}
                          key={option.label}
                          onClick={() => applyQuickDeadline(option.value)}
                          type="button"
                        >
                          <span>{option.label}</span>
                          <small>{formatDate(option.value).slice(6)}</small>
                        </button>
                      ))}
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
                  <button className="ghost" onClick={() => closeReviewComposer(true)} type="button">
                    초안 저장
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
      <section className="review-workspace">
        <aside className="review-list-pane" aria-label="검토요청 목록">
          <div className="review-list-head">
            <h2>{profile.role === 'leader' ? '검토요청' : '내 검토요청'}</h2>
            <span>{visibleReviewRequests.length}건</span>
          </div>
          <div className="review-filter-row" role="group" aria-label="검토요청 상태 필터">
            <button
              className={statusFilter === 'all' ? 'filter-chip selected' : 'filter-chip'}
              onClick={() => setStatusFilter('all')}
              type="button"
            >
              전체 {scopedReviewRequests.length}
            </button>
            {(Object.entries(reviewStatusLabels) as Array<[ReviewStatus, string]>).map(([value, label]) => (
              <button
                className={statusFilter === value ? 'filter-chip selected' : 'filter-chip'}
                key={value}
                onClick={() => setStatusFilter(value)}
                type="button"
              >
                {label} {statusCounts[value]}
              </button>
            ))}
          </div>
          {visibleReviewRequests.length === 0 && <p className="empty">검토요청이 없습니다.</p>}
          {visibleReviewRequests.map((request) => {
            const dueStatus = dueDateStatus(request.due_date)
            const dueHot = dueStatus === 'overdue' || dueStatus === 'due_now'
            return (
              <button
                className={selectedReview?.id === request.id ? 'review-list-item selected' : 'review-list-item'}
                key={request.id}
                onClick={() => setSelectedReviewId(request.id)}
                type="button"
              >
                <span className="review-list-top">
                  <Badge status={request.status}>{reviewStatusLabels[request.status]}</Badge>
                  <time>{formatDate(request.created_at)}</time>
                </span>
                <strong>{request.title}</strong>
                <span className="review-list-meta">
                  {request.profiles?.name ?? '요청자'} · 접수 {ageInDays(request.created_at)}일
                  {request.due_date && (
                    <>
                      {' · '}
                      <span className={dueHot ? 'due-hot' : undefined}>{dueDateLabel(request.due_date)}</span>
                    </>
                  )}
                </span>
              </button>
            )
          })}
        </aside>
        <div className="review-detail-pane" aria-live="polite">
          {selectedReview ? (
            <ReviewRequestItem
              addFeedback={addFeedback}
              feedback={feedback}
              key={selectedReview.id}
              onEdit={openReviewEditor}
              onWithdraw={(id) => setPendingWithdrawId(id)}
              pendingWithdraw={pendingWithdrawId === selectedReview.id}
              profile={profile}
              rejectReview={rejectReview}
              request={selectedReview}
              setFeedback={setFeedback}
              updateStatus={updateStatus}
              withdrawReview={withdrawReview}
            />
          ) : (
            <p className="empty">왼쪽 목록에서 검토요청을 선택하세요.</p>
          )}
        </div>
      </section>
    </div>
  )
}

