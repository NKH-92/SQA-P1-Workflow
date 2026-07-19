import { useEffect, useMemo, useState, type Dispatch, type FormEvent, type SetStateAction } from 'react'
import {
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
import { CopyLinkButton, EmptyState, Modal } from '../components/ui'
import { sortAnnouncements } from '../data/announcementCollection'
import { useAnnouncementController } from '../features/announcements/useAnnouncementController'
import type { MutateFn } from '../app/types'
import type { AppData, Profile } from '../types'
import './AnnouncementsPanel.css'

type Announcement = AppData['announcements'][number]

type AnnouncementForm = {
  title: string
  body: string
  isPinned: boolean
}

const emptyForm: AnnouncementForm = {
  title: '',
  body: '',
  isPinned: false,
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

function timestamp(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function formatAnnouncementDate(value: string | null | undefined) {
  const parsed = timestamp(value)
  return parsed > 0 ? dateFormatter.format(new Date(parsed)) : '날짜 없음'
}

function AnnouncementEditorModal({
  open,
  editingAnnouncement,
  form,
  setForm,
  onClose,
  onSubmit,
}: {
  open: boolean
  editingAnnouncement: Announcement | null
  form: AnnouncementForm
  setForm: Dispatch<SetStateAction<AnnouncementForm>>
  onClose: () => void
  onSubmit: () => void
}) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onSubmit()
  }

  return (
    <Modal
      className="announcement-modal"
      closeLabel="공지 편집 닫기"
      description="파트원에게 전달할 제목과 내용을 입력하세요."
      eyebrow="Announcement"
      icon={<Megaphone size={18} />}
      onClose={onClose}
      open={open}
      title={editingAnnouncement ? '공지 수정' : '새 공지 작성'}
    >
      <form className="announcement-editor" onSubmit={submit}>
        <label className="announcement-editor-field">
          <span>제목</span>
          <input
            autoFocus
            maxLength={200}
            onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
            placeholder="공지 제목을 입력하세요"
            value={form.title}
          />
        </label>
        <label className="announcement-editor-field">
          <span>내용</span>
          <textarea
            maxLength={20000}
            onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
            placeholder="공지 내용을 입력하세요"
            rows={12}
            value={form.body}
          />
        </label>
        <label className="announcement-pin-option">
          <input
            checked={form.isPinned}
            onChange={(event) => setForm((current) => ({ ...current, isPinned: event.target.checked }))}
            type="checkbox"
          />
          <span>
            <Pin size={15} aria-hidden="true" />
            상단에 고정
            <small>중요 공지를 일반 공지보다 위에 계속 표시합니다.</small>
          </span>
        </label>
        <footer className="modal-footer announcement-modal-footer">
          <span className="modal-shortcut">제목과 내용을 모두 입력해야 저장할 수 있습니다.</span>
          <div>
            <button className="ghost" onClick={onClose} type="button">
              취소
            </button>
            <button className="primary" disabled={!form.title.trim() || !form.body.trim()} type="submit">
              {editingAnnouncement ? '공지 수정' : '공지 등록'}
            </button>
          </div>
        </footer>
      </form>
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
  const [query, setQuery] = useState('')
  const [selectedAnnouncementId, setSelectedAnnouncementId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null)
  const [form, setForm] = useState<AnnouncementForm>(emptyForm)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

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
  const selectedAnnouncement =
    sortedAnnouncements.find((announcement) => announcement.id === selectedAnnouncementId) ?? null

  useEffect(() => {
    if (!initialSelectedId) return
    if (!data.announcements.some((announcement) => announcement.id === initialSelectedId)) return
    setQuery('')
    setSelectedAnnouncementId(initialSelectedId)
    setPendingDeleteId(null)
    onInitialSelectionApplied?.()
  }, [data.announcements, initialSelectedId, onInitialSelectionApplied])

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
    setPendingDeleteId(null)
  }, [data.announcements, filteredAnnouncements, initialSelectedId, selectedAnnouncementId])

  const selectAnnouncement = (announcementId: string) => {
    setSelectedAnnouncementId(announcementId)
    setPendingDeleteId(null)
  }

  const openCreate = () => {
    setEditingAnnouncement(null)
    setForm(emptyForm)
    setEditorOpen(true)
  }

  const openEdit = (announcement: Announcement) => {
    setEditingAnnouncement(announcement)
    setForm({
      title: announcement.title,
      body: announcement.body,
      isPinned: announcement.is_pinned,
    })
    setEditorOpen(true)
  }

  const closeEditor = () => {
    setEditorOpen(false)
    setEditingAnnouncement(null)
    setForm(emptyForm)
  }

  const saveAnnouncement = async () => {
    if (!leaderMode || !form.title.trim() || !form.body.trim()) return
    const editingId = editingAnnouncement?.id ?? null
    const ok = await mutate(async () => {
      await controller.save(editingId, editingAnnouncement?.updated_at ?? null, {
        title: form.title.trim(),
        body: form.body.trim(),
        is_pinned: form.isPinned,
      })
    }, editingId ? '공지를 수정했습니다.' : '공지를 등록했습니다.')
    if (ok) closeEditor()
  }

  const togglePin = (announcement: Announcement) =>
    mutate(async () => {
      await controller.togglePin(announcement)
    }, announcement.is_pinned ? '공지 상단 고정을 해제했습니다.' : '공지를 상단에 고정했습니다.')

  const deleteAnnouncement = (announcement: Announcement) =>
    mutate(async () => {
      await controller.remove(announcement)
      setPendingDeleteId(null)
      setSelectedAnnouncementId(null)
    }, '공지를 삭제했습니다.')

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
          <time dateTime={announcement.created_at}>{formatAnnouncementDate(announcement.created_at)}</time>
        </span>
      </button>
    )
  }

  return (
    <div className="stack announcements-stack">
      <div className="page-intro announcements-intro">
        <div>
          <h1>공지</h1>
          <p>
            파트 공지 <strong>{data.announcements.length}건</strong>
            {pinnedAnnouncements.length > 0 && <> · 상단 고정 {pinnedAnnouncements.length}건</>}
          </p>
        </div>
        {leaderMode && (
          <button className="primary" onClick={openCreate} type="button">
            <Plus size={16} />
            새 공지
          </button>
        )}
      </div>

      <section className="announcement-board">
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
            {filteredAnnouncements.length === 0 && (
              <EmptyState
                icon={<Megaphone size={22} />}
                title={query ? '검색 결과가 없습니다.' : '등록된 공지가 없습니다.'}
                description={query ? '다른 검색어로 다시 찾아보세요.' : '새 공지가 등록되면 이곳에 표시됩니다.'}
              />
            )}
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

        <article aria-live="polite" className="announcement-detail-pane">
          {selectedAnnouncement ? (
            <div className="announcement-detail" data-announcement-id={selectedAnnouncement.id}>
              <header className="announcement-detail-header">
                <div className="announcement-detail-heading">
                  {selectedAnnouncement.is_pinned && (
                    <span className="announcement-pin-badge">
                      <Pin size={12} aria-hidden="true" />
                      상단 고정
                    </span>
                  )}
                  <h2>{selectedAnnouncement.title}</h2>
                  <div className="announcement-detail-meta">
                    <span>
                      <UserRound size={14} aria-hidden="true" />
                      {profilesById.get(selectedAnnouncement.created_by)?.name ?? '작성자 알 수 없음'}
                    </span>
                    <span>
                      <CalendarDays size={14} aria-hidden="true" />
                      <time dateTime={selectedAnnouncement.created_at}>
                        {formatAnnouncementDate(selectedAnnouncement.created_at)}
                      </time>
                    </span>
                    {selectedAnnouncement.updated_at !== selectedAnnouncement.created_at && (
                      <span>수정 {formatAnnouncementDate(selectedAnnouncement.updated_at)}</span>
                    )}
                  </div>
                </div>
                <div className="announcement-detail-actions">
                  <CopyLinkButton entityId={selectedAnnouncement.id} tab="announcements" />
                  {leaderMode && (
                    <>
                      <button
                        aria-pressed={selectedAnnouncement.is_pinned}
                        className="ghost compact"
                        onClick={() => void togglePin(selectedAnnouncement)}
                        title={selectedAnnouncement.is_pinned ? '상단 고정 해제' : '상단 고정'}
                        type="button"
                      >
                        {selectedAnnouncement.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        {selectedAnnouncement.is_pinned ? '고정 해제' : '상단 고정'}
                      </button>
                      <button
                        className="ghost compact"
                        onClick={() => openEdit(selectedAnnouncement)}
                        type="button"
                      >
                        <Pencil size={14} />
                        수정
                      </button>
                      {pendingDeleteId === selectedAnnouncement.id ? (
                        <div className="delete-confirm announcement-delete-confirm">
                          <button
                            className="danger compact"
                            onClick={() => void deleteAnnouncement(selectedAnnouncement)}
                            type="button"
                          >
                            삭제 확인
                          </button>
                          <button
                            className="ghost compact"
                            onClick={() => setPendingDeleteId(null)}
                            type="button"
                          >
                            취소
                          </button>
                        </div>
                      ) : (
                        <button
                          className="ghost compact"
                          onClick={() => setPendingDeleteId(selectedAnnouncement.id)}
                          type="button"
                        >
                          <Trash2 size={14} />
                          삭제
                        </button>
                      )}
                    </>
                  )}
                </div>
              </header>
              <div className="announcement-detail-body">{selectedAnnouncement.body}</div>
            </div>
          ) : (
            <EmptyState
              icon={<Megaphone size={24} />}
              title="왼쪽 목록에서 공지를 선택하세요."
              description="공지 제목을 선택하면 상세 내용이 이곳에 표시됩니다."
            />
          )}
        </article>
      </section>

      {leaderMode && (
        <AnnouncementEditorModal
          editingAnnouncement={editingAnnouncement}
          form={form}
          onClose={closeEditor}
          onSubmit={() => void saveAnnouncement()}
          open={editorOpen}
          setForm={setForm}
        />
      )}
    </div>
  )
}
