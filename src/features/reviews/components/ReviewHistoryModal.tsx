import { useEffect, useRef, useState } from 'react'
import { Archive, RotateCcw, Search } from 'lucide-react'
import { EmptyState, Modal } from '../../../components/ui'
import { toUserMessage } from '../../../lib/errors'
import { formatDateTime, formatMonthDay, reviewStatusLabels } from '../../../lib/format'
import {
  asReviewHistoryRow,
  orderReviewHistoryRows as orderHistoryRows,
  type ReviewHistoryOrder as HistoryOrder,
} from '../../../lib/reviewHistory'
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
  { value: 'approved' as const, label: reviewStatusLabels.approved },
  { value: 'rejected' as const, label: reviewStatusLabels.rejected },
  { value: 'withdrawn' as const, label: reviewStatusLabels.withdrawn },
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
  onReopen: (request: ReviewRequest) => Promise<boolean>
}

function mergeRows(seed: ReviewHistoryRow | null, rows: ReviewHistoryRow[]): ReviewHistoryRow[] {
  const byId = new Map<string, ReviewHistoryRow>()
  if (seed) byId.set(seed.id, seed)
  for (const row of rows) byId.set(row.id, row)
  return [...byId.values()]
}

function historyRowLabel(row: ReviewHistoryRow) {
  const day = formatMonthDay(row.terminal_at)
  const status = reviewStatusLabels[row.status]
  return day ? `${day} ${status}` : status
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
  const [order, setOrder] = useState<HistoryOrder>('newest')
  const searchRef = useRef<HTMLInputElement>(null)
  const rowsRef = useRef<ReviewHistoryRow[]>([])
  const loadRef = useRef(onLoadPage)
  const requestVersionRef = useRef(0)

  useEffect(() => {
    loadRef.current = onLoadPage
  }, [onLoadPage])

  const orderedRows = orderHistoryRows(rows, order)
  const selectedReview = rows.find((row) => row.id === selectedId) ?? orderedRows[0] ?? null

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
        return initialSeed?.id ?? orderHistoryRows(nextRows, 'newest')[0]?.id ?? null
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

  const reopen = async (request: ReviewRequest) => {
    const ok = await onReopen(request)
    if (ok) onClose()
    return ok
  }

  const loadMoreButton = hasMore ? (
    <button
      className="ghost review-history-more"
      disabled={loading || !cursor}
      onClick={() => void loadPage(applied, cursor, false)}
      type="button"
    >
      {loading ? '불러오는 중…' : '더 오래된 기록 보기'}
    </button>
  ) : null

  return (
    <Modal
      className="review-history-modal"
      description="처리한 지 7일이 지난 검토요청을 찾아볼 수 있어요."
      eyebrow="검토요청"
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
            placeholder="제목, 설명, 요청자로 찾기"
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
            <strong>
              검색 결과 {rows.length}{hasMore ? '+' : ''}건
            </strong>
            <div className="review-history-order" role="group" aria-label="처리 시점 정렬">
              <button
                aria-pressed={order === 'newest'}
                className={order === 'newest' ? 'selected' : ''}
                onClick={() => setOrder('newest')}
                type="button"
              >
                최신순
              </button>
              <button
                aria-pressed={order === 'oldest'}
                className={order === 'oldest' ? 'selected' : ''}
                onClick={() => setOrder('oldest')}
                type="button"
              >
                오래된순
              </button>
            </div>
          </header>
          <p className="review-history-order-note">
            {order === 'newest'
              ? '처리한 시점이 최근인 기록부터 보여요.'
              : '불러온 기록을 처리한 시점이 오래된 순서로 보여요.'}
          </p>
          {loading && rows.length === 0 && <p className="empty-copy" role="status">검토 이력을 불러오고 있어요.</p>}
          {error && (
            <div className="notice error review-history-error" role="alert">
              <span>{error}</span>
              <button
                className="ghost compact"
                disabled={loading}
                onClick={() => void (rows.length > 0 && cursor ? loadPage(applied, cursor, false) : loadPage(applied, null, true))}
                type="button"
              >
                다시 시도
              </button>
            </div>
          )}
          {!loading && !error && rows.length === 0 && (
            <EmptyState
              icon={<Archive size={22} />}
              title="조건에 맞는 검토 이력이 없어요"
              description="검색어나 기간을 바꿔 보세요."
            />
          )}
          {order === 'oldest' && loadMoreButton}
          {orderedRows.map((row) => (
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
                <time data-status={row.status} dateTime={row.terminal_at} title={formatDateTime(row.terminal_at)}>
                  {historyRowLabel(row)}
                </time>
                <span>{row.profiles?.name ?? '요청자'}</span>
              </span>
            </button>
          ))}
          {order === 'newest' && loadMoreButton}
        </aside>
        <div className="review-history-detail">
          <ReviewDetail
            addFeedback={async () => false}
            inlineConfirm
            localEvents={localEvents}
            onApprove={async () => false}
            onEdit={() => undefined}
            onReject={async () => false}
            onReopen={reopen}
            onResubmit={() => undefined}
            onWithdraw={() => undefined}
            profile={profile}
            readOnly
            selectedReview={selectedReview}
            updateFeedback={async () => false}
            voidFeedback={async () => false}
          />
        </div>
      </div>
    </Modal>
  )
}
