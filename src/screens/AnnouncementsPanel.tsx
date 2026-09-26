import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type FormEvent,
  type KeyboardEvent,
  type SetStateAction,
} from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Megaphone,
  Pencil,
  Pin,
  PinOff,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { CopyLinkButton, DialogActions, EmptyState, Modal, OverflowMenu } from '../components/ui'
import { sortAnnouncements } from '../data/announcementCollection'
import { useAnnouncementController } from '../features/announcements/useAnnouncementController'
import { useMobileDetail } from '../hooks/useMobileDetail'
import { useViewState } from '../hooks/useViewState'
import { useComposerIntent } from '../app/hooks/useComposerIntent'
import { useSelectionHashSync } from '../app/hooks/useHashNavigation'
import { formatDateTime } from '../lib/format'
import { quoted, quotedWithJosa } from '../lib/korean'
import { preferredScrollBehavior } from '../lib/motion'
import type { MutateFn } from '../app/types'
import type { AppData, Profile } from '../types'
import './AnnouncementsPanel.css'

type Announcement = AppData['announcements'][number]

type AnnouncementForm = {
  title: string
  body: string
  isPinned: boolean
}

type FieldErrors = { title?: string; body?: string }

const emptyForm: AnnouncementForm = {
  title: '',
  body: '',
  isPinned: false,
}

const TITLE_MAX_LENGTH = 200
const BODY_MAX_LENGTH = 20000

const isString = (value: unknown): value is string => typeof value === 'string'

function formFromAnnouncement(announcement: Announcement | null): AnnouncementForm {
  if (!announcement) return emptyForm
  return { title: announcement.title, body: announcement.body, isPinned: announcement.is_pinned }
}

function sameForm(left: AnnouncementForm, right: AnnouncementForm) {
  return left.title === right.title && left.body === right.body && left.isPinned === right.isPinned
}

function announcementDate(value: string | null | undefined) {
  const text = formatDateTime(value)
  return text === '-' ? '날짜 없음' : text
}

/**
 * 공지 작성·수정 창. 입력이 있으면(dirty) 배경을 눌러도 닫히지 않고, 닫기·X·Esc·뒤로가기는
 * “작성 중인 내용이 있어요” 확인을 먼저 보여준다(P0-2). 버튼은 늘 누를 수 있고, 빈 칸은 칸 아래에서 알려준다.
 */
function AnnouncementEditorModal({
  editingAnnouncement,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  editingAnnouncement: Announcement | null
  form: AnnouncementForm
  setForm: Dispatch<SetStateAction<AnnouncementForm>>
  onClose: () => void
  onSubmit: () => Promise<boolean>
}) {
  const [initialForm] = useState(() => formFromAnnouncement(editingAnnouncement))
  const [errors, setErrors] = useState<FieldErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const titleId = useId()
  const bodyId = useId()
  const titleErrorId = useId()
  const bodyErrorId = useId()
  const dirty = !sameForm(form, initialForm)
  const editing = Boolean(editingAnnouncement)

  const submit = async () => {
    if (submitting) return
    const nextErrors: FieldErrors = {}
    if (!form.title.trim()) nextErrors.title = '제목을 입력해 주세요'
    if (!form.body.trim()) nextErrors.body = '내용을 입력해 주세요'
    setErrors(nextErrors)
    if (nextErrors.title) {
      titleRef.current?.focus()
      return
    }
    if (nextErrors.body) {
      bodyRef.current?.focus()
      return
    }
    setSubmitting(true)
    try {
      await onSubmit()
    } finally {
      setSubmitting(false)
    }
  }

  const onFormSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void submit()
  }

  const onFormKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault()
      void submit()
    }
  }

  return (
    <Modal
      className="announcement-modal"
      closeLabel="공지 편집 닫기"
      description="파트원에게 전할 제목과 내용을 적어 주세요."
      dirty={dirty}
      eyebrow="공지"
      icon={<Megaphone size={18} />}
      onClose={onClose}
      open
      title={editing ? '공지 수정' : '새 공지 작성'}
    >
      <form
        aria-busy={submitting || undefined}
        className="announcement-editor"
        noValidate
        onKeyDown={onFormKeyDown}
        onSubmit={onFormSubmit}
      >
        <div className="announcement-editor-field">
          <label htmlFor={titleId}>
            제목 <span aria-hidden="true">*</span>
          </label>
          <input
            ref={titleRef}
            aria-describedby={errors.title ? titleErrorId : undefined}
            aria-invalid={errors.title ? true : undefined}
            aria-required="true"
            data-autofocus
            id={titleId}
            maxLength={TITLE_MAX_LENGTH}
            onChange={(event) => {
              const title = event.target.value
              setForm((current) => ({ ...current, title }))
              if (errors.title && title.trim()) setErrors((current) => ({ ...current, title: undefined }))
            }}
            placeholder="제목을 입력해 주세요"
            value={form.title}
          />
          {errors.title && (
            <p className="field-error" id={titleErrorId}>
              {errors.title}
            </p>
          )}
        </div>
        <div className="announcement-editor-field">
          <label htmlFor={bodyId}>
            내용 <span aria-hidden="true">*</span>
          </label>
          <textarea
            ref={bodyRef}
            aria-describedby={errors.body ? bodyErrorId : undefined}
            aria-invalid={errors.body ? true : undefined}
            aria-required="true"
            id={bodyId}
            maxLength={BODY_MAX_LENGTH}
            onChange={(event) => {
              const body = event.target.value
              setForm((current) => ({ ...current, body }))
              if (errors.body && body.trim()) setErrors((current) => ({ ...current, body: undefined }))
            }}
            placeholder="내용을 입력해 주세요"
            rows={10}
            value={form.body}
          />
          {errors.body && (
            <p className="field-error" id={bodyErrorId}>
              {errors.body}
            </p>
          )}
        </div>
        <label className="announcement-pin-option">
          <input
            checked={form.isPinned}
            onChange={(event) => {
              const isPinned = event.target.checked
              setForm((current) => ({ ...current, isPinned }))
            }}
            type="checkbox"
          />
          <span>
            <Pin size={15} aria-hidden="true" />
            상단에 고정
            <small>중요한 공지를 목록 맨 위에 계속 보여 줘요.</small>
          </span>
        </label>
        <DialogActions
          hint={
            <span className="modal-shortcut">
              <kbd>Ctrl</kbd>
              <kbd>Enter</kbd>
              {editing ? '저장' : '올리기'}
            </span>
          }
          onClose={onClose}
        >
          <button className="primary" disabled={submitting} type="submit">
            {submitting ? (editing ? '저장하는 중…' : '올리는 중…') : editing ? '저장하기' : '공지 올리기'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}

/** 공지 삭제 확인 창. 처음 포커스는 안전한 ‘닫기’에 둔다. */
function AnnouncementDeleteModal({
  announcement,
  onClose,
  onDelete,
}: {
  announcement: Announcement
  onClose: () => void
  onDelete: () => Promise<boolean>
}) {
  const [deleting, setDeleting] = useState(false)
  return (
    <Modal
      className="announcement-delete-modal"
      closeLabel="공지 삭제 닫기"
      description="삭제한 공지는 되돌릴 수 없어요. 파트원 화면에서도 바로 사라져요."
      icon={<Trash2 size={18} />}
      onClose={onClose}
      open
      title={`${quotedWithJosa(announcement.title, '을/를')} 삭제할까요?`}
    >
      <DialogActions onClose={onClose}>
        <button
          className="danger"
          disabled={deleting}
          onClick={async () => {
            setDeleting(true)
            try {
              await onDelete()
            } finally {
              setDeleting(false)
            }
          }}
          type="button"
        >
          {deleting ? '삭제하는 중…' : '삭제하기'}
        </button>
      </DialogActions>
    </Modal>
  )
}

export function AnnouncementsPanel({
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
  const controller = useAnnouncementController(profile, data, setData)
  const leaderMode = profile.role === 'leader' && profile.is_active !== false && profile.must_change_password !== true
  const [query, setQuery] = useViewState(`announcements.${leaderMode ? 'leader' : 'member'}.query`, '', isString)
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)
  const [form, setForm] = useState<AnnouncementForm>(emptyForm)
  const [deleteTarget, setDeleteTarget] = useState<Announcement | null>(null)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  // 새 공지를 올리면 목록에 나타나는 즉시 그 공지를 고른다(FLW-11).
  const [pendingNewSelection, setPendingNewSelection] = useState<{ knownIds: string[]; title: string } | null>(null)
  const detailRef = useRef<HTMLElement>(null)

  const profilesById = useMemo(
    () => new Map(data.profiles.map((candidate) => [candidate.id, candidate])),
    [data.profiles],
  )
  const sortedAnnouncements = useMemo(
    () => sortAnnouncements(data.announcements),
    [data.announcements],
  )
  const filteredAnnouncements = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ko-KR')
    if (!normalizedQuery) return sortedAnnouncements

    return sortedAnnouncements.filter((announcement) => {
      const authorName = profilesById.get(announcement.created_by)?.name ?? ''
      return `${announcement.title} ${announcement.body} ${authorName}`
        .toLocaleLowerCase('ko-KR')
        .includes(normalizedQuery)
    })
  }, [profilesById, query, sortedAnnouncements])

  const pinnedAnnouncements = filteredAnnouncements.filter((announcement) => announcement.is_pinned)
  const regularAnnouncements = filteredAnnouncements.filter((announcement) => !announcement.is_pinned)
  const totalPinnedCount = data.announcements.filter((announcement) => announcement.is_pinned).length
  const selectedAnnouncement =
    sortedAnnouncements.find((announcement) => announcement.id === selectedAnnouncementId) ?? null

  const closeMobileDetail = useCallback(() => {
    setMobileDetailOpen(false)
    // 목록으로 돌아오면 방금 보던 공지에 포커스를 돌려준다.
    window.requestAnimationFrame(() => {
      const current = document.querySelector<HTMLElement>('.announcement-list-item[aria-current="true"]')
      if (!current) return
      if (typeof current.scrollIntoView === 'function') {
        current.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest' })
      }
      current.focus({ preventScroll: true })
    })
  }, [])

  useMobileDetail({
    open: mobileDetailOpen && Boolean(selectedAnnouncement),
    detailRef,
    onBack: closeMobileDetail,
    selectionKey: selectedAnnouncementId,
  })

  useEffect(() => {
    if (!initialSelectedId) return
    if (!data.announcements.some((announcement) => announcement.id === initialSelectedId)) return
    setQuery('')
    setSelectedAnnouncementId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [data.announcements, initialSelectedId, onInitialSelectionApplied, setQuery])

  useEffect(() => {
    if (!pendingNewSelection) return
    const created = sortedAnnouncements.find(
      (announcement) => !pendingNewSelection.knownIds.includes(announcement.id)
        && announcement.title === pendingNewSelection.title,
    )
    if (!created) return
    setQuery('')
    setSelectedAnnouncementId(created.id)
    setPendingNewSelection(null)
  }, [pendingNewSelection, setQuery, sortedAnnouncements])

  useEffect(() => {
    const hasPendingInitialSelection = Boolean(
      initialSelectedId && data.announcements.some((announcement) => announcement.id === initialSelectedId),
    )
    if (hasPendingInitialSelection) return
    if (
      selectedAnnouncementId &&
      filteredAnnouncements.some((announcement) => announcement.id === selectedAnnouncementId)
    ) {
      return
    }
    setSelectedAnnouncementId(filteredAnnouncements[0]?.id ?? null)
  }, [data.announcements, filteredAnnouncements, initialSelectedId, selectedAnnouncementId])

  const selectAnnouncement = (announcementId: string) => {
    setSelectedAnnouncementId(announcementId)
    setMobileDetailOpen(true)
  }

  const openCreate = () => {
    setEditingAnnouncement(null)
    setForm(emptyForm)
    setEditorOpen(true)
  }

  useComposerIntent('announcements', openCreate, leaderMode)
  useSelectionHashSync('announcements', initialSelectedId ? undefined : selectedAnnouncement?.id ?? null)

  const openEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setForm(formFromAnnouncement(announcement))
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditingAnnouncement(null)
    setForm(emptyForm)
  }

  const saveAnnouncement = async () => {
    const title = form.title.trim()
    const body = form.body.trim()
    if (!leaderMode || !title || !body) return false
    const editingId = editingAnnouncement?.id ?? null
    if (!editingId) setPendingNewSelection({ knownIds: data.announcements.map((item) => item.id), title })
    const ok = await mutate(async () => {
      await controller.save(editingId, editingAnnouncement?.updated_at ?? null, {
        title,
        body,
        is_pinned: form.isPinned,
      })
    }, editingId ? `${quotedWithJosa(title, '을/를')} 수정했어요.` : `${quotedWithJosa(title, '을/를')} 올렸어요.`)
    if (ok) {
      closeEditor()
      if (!editingId) setMobileDetailOpen(true)
    } else {
      setPendingNewSelection(null)
    }
    return ok
  }

  const togglePin = (announcement: Announcement) =>
    mutate(async () => {
      await controller.togglePin(announcement)
    }, announcement.is_pinned
      ? `${quoted(announcement.title)} 공지 고정을 풀었어요.`
      : `${quoted(announcement.title)} 공지를 맨 위에 고정했어요.`)

  const deleteAnnouncement = async (announcement: Announcement) => {
    const ok = await mutate(async () => {
      await controller.remove(announcement)
    }, `${quotedWithJosa(announcement.title, '을/를')} 삭제했어요.`)
    if (ok) {
      setDeleteTarget(null)
      setSelectedAnnouncementId(null)
      setMobileDetailOpen(false)
    }
    return ok
  }

  const renderAnnouncementButton = (announcement: Announcement) => {
    const author = profilesById.get(announcement.created_by)
    return (
      <button
        aria-current={selectedAnnouncementId === announcement.id ? 'true' : undefined}
        className={
          selectedAnnouncementId === announcement.id
            ? 'announcement-list-item selected'
            : 'announcement-list-item'
        }
        data-pinned={announcement.is_pinned ? 'true' : 'false'}
        key={announcement.id}
        onClick={() => selectAnnouncement(announcement.id)}
        type="button"
      >
        <span className="announcement-list-title">
          {announcement.is_pinned && (
            <span className="announcement-pin-badge">
              <Pin size={11} aria-hidden="true" />
              고정
            </span>
          )}
          <strong>{announcement.title}</strong>
        </span>
        <span className="announcement-list-preview">{announcement.body}</span>
        <span className="announcement-list-meta">
          <span>{author?.name ?? '작성자 알 수 없음'}</span>
          <time dateTime={announcement.created_at}>{announcementDate(announcement.created_at)}</time>
        </span>
      </button>
    )
  }

  const listEmptyState = query.trim() ? (
    <EmptyState
      icon={<Search size={22} />}
      title="검색 결과가 없어요"
      description="다른 검색어로 다시 찾아보세요."
      action={
        <button className="ghost compact" onClick={() => setQuery('')} type="button">
          검색어 지우기
        </button>
      }
    />
  ) : (
    <EmptyState
      icon={<Megaphone size={22} />}
      title="아직 공지가 없어요"
      description={leaderMode ? '새 공지를 올리면 파트원 모두 여기서 볼 수 있어요.' : '파트장이 공지를 올리면 여기에 보여요.'}
    />
  )

  return (
    <div className="stack announcements-stack">
      <div className="page-intro announcements-intro">
        <div>
          <h1>공지</h1>
          <p>
            공지 <strong>{data.announcements.length}건</strong>
            {totalPinnedCount > 0 && <> · 상단 고정 {totalPinnedCount}건</>}
          </p>
        </div>
        {leaderMode && (
          <button className="primary" onClick={openCreate} type="button">
            <Plus size={16} />
            새 공지
          </button>
        )}
      </div>

      <section className="announcement-board" data-mobile-detail={mobileDetailOpen ? 'open' : 'closed'}>
        <aside aria-label="공지 목록" className="announcement-list-pane">
          <div className="announcement-list-head">
            <div>
              <h2>공지 게시판</h2>
              <span>{filteredAnnouncements.length}건</span>
            </div>
            <label className="announcement-search">
              <Search size={15} aria-hidden="true" />
              <input
                aria-label="공지 검색"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="제목, 내용, 작성자 검색"
                value={query}
              />
            </label>
          </div>

          <div className="announcement-list-scroll">
            {filteredAnnouncements.length === 0 && listEmptyState}
            {pinnedAnnouncements.length > 0 && (
              <div className="announcement-list-group">
                <div className="announcement-list-group-label">
                  <Pin size={12} aria-hidden="true" />
                  상단 고정
                </div>
                {pinnedAnnouncements.map(renderAnnouncementButton)}
              </div>
            )}
            {regularAnnouncements.length > 0 && (
              <div className="announcement-list-group">
                {pinnedAnnouncements.length > 0 && (
                  <div className="announcement-list-group-label">전체 공지</div>
                )}
                {regularAnnouncements.map(renderAnnouncementButton)}
              </div>
            )}
          </div>
        </aside>

        <article ref={detailRef} aria-label="공지 내용" className="announcement-detail-pane">
          {selectedAnnouncement ? (
            <div className="announcement-detail" data-announcement-id={selectedAnnouncement.id}>
              <header className="announcement-detail-header">
                <div className="announcement-detail-heading">
                  <button className="ghost compact announcement-detail-back" onClick={closeMobileDetail} type="button">
                    <ArrowLeft aria-hidden="true" size={14} />
                    공지 목록
                  </button>
                  {selectedAnnouncement.is_pinned && (
                    <span className="announcement-pin-badge">
                      <Pin size={12} aria-hidden="true" />
                      상단 고정
                    </span>
                  )}
                  <h2 data-detail-title>{selectedAnnouncement.title}</h2>
                  <div className="announcement-detail-meta">
                    <span>
                      <UserRound size={14} aria-hidden="true" />
                      {profilesById.get(selectedAnnouncement.created_by)?.name ?? '작성자 알 수 없음'}
                    </span>
                    <span>
                      <CalendarDays size={14} aria-hidden="true" />
                      <time dateTime={selectedAnnouncement.created_at}>
                        {announcementDate(selectedAnnouncement.created_at)}
                      </time>
                    </span>
                    {selectedAnnouncement.updated_at !== selectedAnnouncement.created_at && (
                      <span>수정 {announcementDate(selectedAnnouncement.updated_at)}</span>
                    )}
                  </div>
                </div>
                <div className="announcement-detail-actions">
                  <CopyLinkButton entityId={selectedAnnouncement.id} tab="announcements" />
                  {leaderMode && (
                    <>
                      <button
                        className="ghost compact"
                        onClick={() => openEdit(selectedAnnouncement)}
                        type="button"
                      >
                        <Pencil size={14} aria-hidden="true" />
                        수정
                      </button>
                      <OverflowMenu
                        label={`${selectedAnnouncement.title} 더보기`}
                        items={[
                          {
                            label: selectedAnnouncement.is_pinned ? '고정 풀기' : '맨 위에 고정',
                            icon: selectedAnnouncement.is_pinned
                              ? <PinOff aria-hidden="true" size={15} />
                              : <Pin aria-hidden="true" size={15} />,
                            onSelect: () => void togglePin(selectedAnnouncement),
                          },
                          {
                            label: '삭제',
                            icon: <Trash2 aria-hidden="true" size={15} />,
                            danger: true,
                            onSelect: () => setDeleteTarget(selectedAnnouncement),
                          },
                        ]}
                      />
                    </>
                  )}
                </div>
              </header>
              <div className="announcement-detail-body">{selectedAnnouncement.body}</div>
            </div>
          ) : (
            <EmptyState
              icon={<Megaphone size={24} />}
              title={filteredAnnouncements.length > 0 ? '목록에서 공지를 선택해 주세요' : '보여 줄 공지가 없어요'}
              description={
                filteredAnnouncements.length > 0
                  ? '공지를 누르면 내용을 여기서 볼 수 있어요.'
                  : leaderMode
                    ? '새 공지를 올리면 여기서 내용을 볼 수 있어요.'
                    : '파트장이 공지를 올리면 여기서 내용을 볼 수 있어요.'
              }
              action={
                leaderMode && filteredAnnouncements.length === 0 && !query.trim() ? (
                  <button className="ghost compact" onClick={openCreate} type="button">
                    <Plus size={14} aria-hidden="true" />
                    첫 공지 쓰기
                  </button>
                ) : undefined
              }
            />
          )}
        </article>
      </section>

      {leaderMode && editorOpen && (
        <AnnouncementEditorModal
          editingAnnouncement={editingAnnouncement}
          form={form}
          onClose={closeEditor}
          onSubmit={saveAnnouncement}
          setForm={setForm}
        />
      )}
      {leaderMode && deleteTarget && (
        <AnnouncementDeleteModal
          announcement={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDelete={() => deleteAnnouncement(deleteTarget)}
        />
      )}
    </div>
  )
}
