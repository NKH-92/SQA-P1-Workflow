import { useEffect, useRef, useState } from 'react'
import { Archive, RotateCcw, Search } from 'lucide-react'
import { EmptyState, Modal } from '../../../components/ui'
import { toUserMessage } from '../../../lib/errors'
import { formatDate, reviewStatusLabels } from '../../../lib/format'
import { asReviewHistoryRow } from '../../../lib/reviewHistory'
import type {
  Profile,
  ReviewEvent,
  ReviewHistoryCursor,
  ReviewHistoryFilters,
  ReviewHistoryPage,
  ReviewHistoryRow,
  ReviewRequest,
} from '../../../types'
import { ReviewDetail } from './ReviewDetail'

const EMPTY_FILTERS: ReviewHistoryFilters = {
  status: null,
  query: '',
  from: null,
  to: null,
}

const TERMINAL_FILTERS = [
  { value: null, label: '전체' },
  { value: 'approved' as const, label: '완료' },
  { value: 'rejected' as const, label: '반려' },
  { value: 'withdrawn' as const, label: '회수' },
]

type ReviewHistoryModalProps = {
  open: boolean
  profile: Profile
  initialRequest?: ReviewRequest | null
  localEvents?: ReviewEvent[]
  onClose: () => void
  onLoadPage: (
    filters: ReviewHistoryFilters,
    cursor: ReviewHistoryCursor | null,
  ) => Promise<ReviewHistoryPage>
  onReopen: (requestId: string) => Promise<boolean>
}

function mergeRows(seed: ReviewHistoryRow | null, rows: ReviewHistoryRow[]): ReviewHistoryRow[] {
  const byId = new Map<string, ReviewHistoryRow>()
  if (seed) byId.set(seed.id, seed)
  for (const row of rows) byId.set(row.id, row)
  return [...byId.values()]
}

export function ReviewHistoryModal({
  open,
  profile,
  initialRequest = null,
  localEvents = [],
  onClose,
  onLoadPage,
  onReopen,
}: ReviewHistoryModalProps) {
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [applied, setApplied] = useState(EMPTY_FILTERS)
  const [rows, setRows] = useState<ReviewHistoryRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<ReviewHistoryCursor | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const rowsRef = useRef<ReviewHistoryRow[]>([])
  const loadRef = useRef(onLoadPage)
  const requestVersionRef = useRef(0)

  useEffect(() => {
    loadRef.current = onLoadPage
  }, [onLoadPage])

  const selectedReview = rows.find((row) => row.id === selectedId) ?? rows[0] ?? null

  const loadPage = async (
    filters: ReviewHistoryFilters,
    nextCursor: ReviewHistoryCursor | null,
    replace: boolean,
    initialSeed: ReviewHistoryRow | null = null,
  ) => {
    const version = ++requestVersionRef.current
    setLoading(true)
    setError(null)
    try {
      const page = await loadRef.current(filters, nextCursor)
      if (version !== requestVersionRef.current) return
      const nextRows = replace
        ? mergeRows(initialSeed, page.rows)
        : mergeRows(null, [...rowsRef.current, ...page.rows])
      rowsRef.current = nextRows
      setRows(nextRows)
      setCursor(page.next_cursor)
      setHasMore(page.has_more)
      setSelectedId((current) => {
        if (current && nextRows.some((row) => row.id === current)) return current
        return initialSeed?.id ?? nextRows[0]?.id ?? null
      })
    } catch (loadError) {
      if (version !== requestVersionRef.current) return
      setError(toUserMessage(loadError))
    } finally {
      if (version === requestVersionRef.current) setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) {
      requestVersionRef.current += 1
      return
    }
    const initialFilters = { ...EMPTY_FILTERS }
    const initialSeed = initialRequest ? asReviewHistoryRow(initialRequest) : null
    setDraft(initialFilters)
    setApplied(initialFilters)
    rowsRef.current = initialSeed ? [initialSeed] : []
    setRows(rowsRef.current)
    setSelectedId(initialSeed?.id ?? null)
    setCursor(null)
    setHasMore(false)
    setError(null)
    void loadPage(initialFilters, null, true, initialSeed)
    // Opening is the lifecycle boundary. Filter changes call loadPage directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialRequest?.id])

  const applyFilters = (filters: ReviewHistoryFilters) => {
    setApplied(filters)
    setSelectedId(null)
    void loadPage(filters, null, true)
  }

  const resetFilters = () => {
    const filters = { ...EMPTY_FILTERS }
    setDraft(filters)
    applyFilters(filters)
    searchRef.current?.focus()
  }

  const reopen = async (requestId: string) => {
    const ok = await onReopen(requestId)
    if (ok) onClose()
    return ok
  }

  return (
    <Modal
      className="review-history-modal"
      description="최근 7일 이전에 종결된 검토요청"
      eyebrow="파트장"
      icon={<Archive size={18} />}
      initialFocusRef={searchRef}
      onClose={onClose}
      open={open}
      title="검토 이력"
    >
      <form
        className="review-history-toolbar"
        onSubmit={(event) => {
          event.preventDefault()
          applyFilters({
            ...draft,
            query: draft.query.trim(),
            from: draft.from || null,
            to: draft.to || null,
          })
        }}
      >
        <label className="search-field review-history-search">
          <Search size={15} aria-hidden="true" />
          <input
            aria-label="검토 이력 검색"
            maxLength={200}
            onChange={(event) => setDraft((current) => ({ ...current, query: event.target.value }))}
            placeholder="제목, 본문, 요청자 검색"
            ref={searchRef}
            type="search"
            value={draft.query}
          />
        </label>
        <div className="review-history-status" role="group" aria-label="검토 이력 상태 필터">
          {TERMINAL_FILTERS.map((filter) => (
            <button
              aria-pressed={draft.status === filter.value}
              className={draft.status === filter.value ? 'filter-chip selected' : 'filter-chip'}
              key={filter.label}
              onClick={() => {
                const next = { ...draft, status: filter.value }
                setDraft(next)
                applyFilters(next)
              }}
              type="button"
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="review-history-date">
          <span>시작일</span>
          <input
            max={draft.to ?? undefined}
            onChange={(event) => setDraft((current) => ({ ...current, from: event.target.value || null }))}
            type="date"
            value={draft.from ?? ''}
          />
        </label>
        <label className="review-history-date">
          <span>종료일</span>
          <input
            min={draft.from ?? undefined}
            onChange={(event) => setDraft((current) => ({ ...current, to: event.target.value || null }))}
            type="date"
            value={draft.to ?? ''}
          />
        </label>
        <button className="primary compact" disabled={loading} type="submit">
          <Search size={14} aria-hidden="true" />
          검색
        </button>
        <button aria-label="검토 이력 필터 초기화" className="icon-button small" onClick={resetFilters} title="필터 초기화" type="button">
          <RotateCcw size={15} aria-hidden="true" />
        </button>
      </form>

      <div className="review-history-workspace">
        <aside aria-label="검토 이력 목록" className="review-history-list">
          <header>
            <strong>검색 결과</strong>
            <span>{rows.length}{hasMore ? '+' : ''}건</span>
          </header>
          {loading && rows.length === 0 && <p className="empty-copy" role="status">검토 이력을 불러오는 중입니다.</p>}
          {error && <p className="notice error" role="alert">{error}</p>}
          {!loading && !error && rows.length === 0 && (
            <EmptyState
              icon={<Archive size={22} />}
              title="조건에 맞는 검토 이력이 없습니다."
              description="검색어나 기간을 바꿔 다시 확인해 주세요."
            />
          )}
          {rows.map((row) => (
            <button
              aria-pressed={selectedReview?.id === row.id}
              className={selectedReview?.id === row.id ? 'review-history-row selected' : 'review-history-row'}
              data-status={row.status}
              key={row.id}
              onClick={() => setSelectedId(row.id)}
              type="button"
            >
              <span className="review-history-row-title">{row.title}</span>
              <span className="review-history-row-meta">
                <span data-status={row.status}>{reviewStatusLabels[row.status]}</span>
                <span>{row.profiles?.name ?? '요청자'}</span>
                <time dateTime={row.terminal_at}>{formatDate(row.terminal_at)}</time>
              </span>
            </button>
          ))}
          {hasMore && (
            <button
              className="ghost review-history-more"
              disabled={loading || !cursor}
              onClick={() => void loadPage(applied, cursor, false)}
              type="button"
            >
              {loading ? '불러오는 중...' : '이전 이력 더 보기'}
            </button>
          )}
        </aside>
        <div className="review-history-detail">
          <ReviewDetail
            addFeedback={async () => false}
            localEvents={localEvents}
            onEdit={() => undefined}
            onWithdraw={() => undefined}
            pendingWithdrawId={null}
            profile={profile}
            readOnly
            rejectReview={async () => false}
            reopenReview={reopen}
            resubmitReview={async () => false}
            selectedReview={selectedReview}
            updateFeedback={async () => false}
            updateStatus={async () => false}
            voidFeedback={async () => false}
            withdrawReview={() => undefined}
          />
        </div>
      </div>
    </Modal>
  )
}
