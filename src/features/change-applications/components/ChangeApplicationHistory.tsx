import { useEffect, useRef, useState } from 'react'
import { AlertCircle, History, RotateCcw, Search } from 'lucide-react'
import { Badge, EmptyState } from '../../../components/ui'
import { formatDate } from '../../../lib/format'
import type {
  AppData,
  ChangeApplicationHistoryCursor,
  ChangeApplicationHistoryFilters,
  ChangeApplicationHistoryPage,
  ChangeApplicationHistoryResult,
  ChangeApplicationHistoryRow,
  Profile,
} from '../../../types'
import { changeApplicationHistoryResultLabel } from '../viewModel'

type HistoryForm = {
  query: string
  result: ChangeApplicationHistoryResult | ''
  from: string
  to: string
  productId: string
  assigneeId: string
}

const emptyForm: HistoryForm = {
  query: '',
  result: '',
  from: '',
  to: '',
  productId: '',
  assigneeId: '',
}

function toFilters(form: HistoryForm, profile: Profile): ChangeApplicationHistoryFilters {
  return {
    query: form.query,
    result: form.result || null,
    from: form.from || null,
    to: form.to || null,
    product_id: form.productId || null,
    assignee_id: profile.role === 'leader' ? form.assigneeId || null : profile.id,
  }
}

function taskStatusLabel(row: ChangeApplicationHistoryRow['product_tasks'][number]) {
  if (row.status === 'completed') return '적용 완료'
  if (row.status === 'not_applicable') return '해당 없음'
  if (row.cancel_kind === 'scope_removed') return '범위 제외'
  if (row.status === 'cancelled') return '취소'
  return '미적용'
}

export function ChangeApplicationHistory({
  data,
  profile,
  fetchPage,
  onUndoCompletion,
}: {
  data: AppData
  profile: Profile
  fetchPage: (
    filters: ChangeApplicationHistoryFilters,
    cursor: ChangeApplicationHistoryCursor | null,
  ) => Promise<ChangeApplicationHistoryPage>
  onUndoCompletion?: (row: ChangeApplicationHistoryRow) => void
}) {
  const [draft, setDraft] = useState<HistoryForm>(emptyForm)
  const [filters, setFilters] = useState<ChangeApplicationHistoryFilters>(() => toFilters(emptyForm, profile))
  const [rows, setRows] = useState<ChangeApplicationHistoryRow[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cursor, setCursor] = useState<ChangeApplicationHistoryCursor | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const requestSequence = useRef(0)

  useEffect(() => {
    const sequence = ++requestSequence.current
    setLoading(true)
    setError(null)
    void fetchPage(filters, null)
      .then((page) => {
        if (sequence !== requestSequence.current) return
        setRows(page.rows)
        setCursor(page.next_cursor)
        setSelectedId((current) => page.rows.some((row) => row.id === current) ? current : page.rows[0]?.id ?? null)
      })
      .catch(() => {
        if (sequence !== requestSequence.current) return
        setRows([])
        setCursor(null)
        setSelectedId(null)
        setError('완료 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
      })
      .finally(() => {
        if (sequence === requestSequence.current) setLoading(false)
      })
  }, [fetchPage, filters])

  const selected = rows.find((row) => row.id === selectedId) ?? null

  const loadMore = async () => {
    if (!cursor || loadingMore) return
    const sequence = requestSequence.current
    setLoadingMore(true)
    setError(null)
    try {
      const page = await fetchPage(filters, cursor)
      if (sequence !== requestSequence.current) return
      setRows((current) => {
        const existing = new Set(current.map((row) => row.id))
        return [...current, ...page.rows.filter((row) => !existing.has(row.id))]
      })
      setCursor(page.next_cursor)
    } catch {
      if (sequence !== requestSequence.current) return
      setError('다음 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="change-history-panel">
      <form
        className="change-history-filters"
        onSubmit={(event) => {
          event.preventDefault()
          setFilters(toFilters(draft, profile))
        }}
      >
        <label className="change-search">
          <Search size={15} />
          <input aria-label="완료 이력 검색" placeholder="변경번호, 제목, 제품, 담당자 검색" value={draft.query} onChange={(event) => setDraft({ ...draft, query: event.target.value })} />
        </label>
        <select aria-label="완료 결과" value={draft.result} onChange={(event) => setDraft({ ...draft, result: event.target.value as HistoryForm['result'] })}>
          <option value="">결과 전체</option>
          <option value="completed">변경 완료</option>
          <option value="cancelled">취소</option>
          <option value="legacy_auto">기존 자동 완료</option>
          <option value="legacy_manual">기존 보관</option>
        </select>
        <input aria-label="이력 시작일" type="date" value={draft.from} onChange={(event) => setDraft({ ...draft, from: event.target.value })} />
        <input aria-label="이력 종료일" type="date" value={draft.to} onChange={(event) => setDraft({ ...draft, to: event.target.value })} />
        <select aria-label="이력 제품" value={draft.productId} onChange={(event) => setDraft({ ...draft, productId: event.target.value })}>
          <option value="">제품 전체</option>
          {data.products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
        </select>
        {profile.role === 'leader' && (
          <select aria-label="이력 담당자" value={draft.assigneeId} onChange={(event) => setDraft({ ...draft, assigneeId: event.target.value })}>
            <option value="">담당자 전체</option>
            {data.changeAssigneeOptions.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}</option>)}
          </select>
        )}
        <button className="primary compact" disabled={loading} type="submit"><Search size={14} />검색</button>
      </form>

      {error && <p className="change-history-error" role="alert"><AlertCircle size={16} />{error}</p>}
      {loading && <p className="change-history-loading" role="status">완료 이력을 불러오는 중입니다.</p>}
      {!loading && !error && rows.length === 0 && (
        <EmptyState icon={<History size={22} />} title="조건에 맞는 완료 이력이 없습니다." description="검색어 또는 필터를 바꿔 다시 확인해 주세요." />
      )}

      {rows.length > 0 && (
        <div className="change-history-workspace">
          <div className="change-history-list" aria-label="완료 이력 목록">
            {rows.map((row) => (
              <button
                aria-pressed={selected?.id === row.id}
                className={selected?.id === row.id ? 'change-history-row selected' : 'change-history-row'}
                key={row.id}
                onClick={() => setSelectedId(row.id)}
                type="button"
              >
                <span className="change-history-main">
                  <span><Badge status={row.history_result}>{changeApplicationHistoryResultLabel(row.history_result)}</Badge><strong>{row.change_number}</strong></span>
                  <b>{row.title}</b>
                  <small>{formatDate(row.history_at)} · {row.final_completed_by_name ?? '기존 이력'}</small>
                </span>
                <span className="change-history-counts">완료 {row.application_summary.completed_count} · 해당 없음 {row.application_summary.not_applicable_count} · 범위 제외 {row.application_summary.scope_removed_count}</span>
              </button>
            ))}
            {cursor && <button className="ghost change-history-more" disabled={loadingMore} onClick={() => void loadMore()} type="button">{loadingMore ? '불러오는 중...' : '더 보기'}</button>}
          </div>

          {selected && (
            <article className="change-history-detail" aria-label="완료 이력 상세">
              <header>
                <div><span>{selected.change_number}</span><h3>{selected.title}</h3><p>{selected.summary}</p></div>
                {profile.role === 'leader' && selected.history_result === 'completed' && onUndoCompletion && (
                  <button className="ghost compact" onClick={() => onUndoCompletion(selected)} type="button"><RotateCcw size={14} />완료 취소</button>
                )}
              </header>
              <dl>
                <div><dt>처리 결과</dt><dd>{changeApplicationHistoryResultLabel(selected.history_result)}</dd></div>
                <div><dt>완료일</dt><dd>{formatDate(selected.history_at)}</dd></div>
                <div><dt>최종 확인자</dt><dd>{selected.final_completed_by_name ?? '기존 이력'}</dd></div>
                <div><dt>처리 제품</dt><dd>{selected.application_summary.processed_count} / {selected.application_summary.total_count}</dd></div>
              </dl>
              {selected.final_completion_note && <p className="change-history-note"><strong>최종 확인 메모</strong>{selected.final_completion_note}</p>}
              <div className="change-history-task-list">
                {selected.product_tasks.map((task) => (
                  <div key={task.id}>
                    <span><strong>{task.product_name}</strong><small>{task.assignee_name ?? '담당 미지정'}</small></span>
                    <Badge status={task.status}>{taskStatusLabel(task)}</Badge>
                    {(task.completion_note || task.resolution_reason) && <p>{task.completion_note || task.resolution_reason}</p>}
                  </div>
                ))}
              </div>
            </article>
          )}
        </div>
      )}
    </div>
  )
}
