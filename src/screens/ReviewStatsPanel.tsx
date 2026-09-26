import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  Filter,
  ListChecks,
  PieChart,
  RotateCcw,
  Table2,
  Users,
} from 'lucide-react'
import { EmptyState, Section } from '../components/ui'
import {
  getReviewStatsAvailableRange,
  selectReviewStats,
  type ReviewStatsFilters,
  type ReviewStatsPreset,
} from '../features/reviews/reviewStats.selectors'
import {
  ExactNumbersTable,
  MonthlyTrendChart,
  RequesterComparisonChart,
  StatusDistribution,
} from '../features/reviews/components/ReviewStatsVisuals'
import {
  formatReviewStatsCount as formatCount,
  REVIEW_STATS_STATUS_OPTIONS as STATUS_OPTIONS,
} from '../features/reviews/reviewStatsVisualFormat'
import {
  reviewStatisticsV2ContentRevision,
  useReviewStatisticsV2,
} from '../features/reviews/useReviewStatisticsV2'
import { ZERO_REVIEW_STATS_V2_KPIS, loadReviewStatsV2View, type ReviewStatsV2View } from '../features/reviews/reviewStatsV2View'
import { businessDateKey } from '../lib/businessTime'
import { GENERIC_FAILURE_MESSAGE, toUserMessage } from '../lib/errors'
import { reviewStatusLabels } from '../lib/format'
import type { AppData } from '../types'
import './ReviewStatsPanel.css'

/**
 * 통계 불러오기 상태. 다시 불러오는 동안(refreshing)에는 이전 숫자를 그대로 보여주고
 * 작은 ‘갱신 중’ 표시만 더한다(읽던 화면이 접혔다 펴지지 않게).
 */
type ReviewStatsV2LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | ({ status: 'ready'; refreshing: boolean } & ReviewStatsV2View)

const PRESET_OPTIONS: Array<{ value: ReviewStatsPreset; label: string }> = [
  { value: 'this-month', label: '이번 달' },
  { value: 'last-3-months', label: '최근 3개월' },
  { value: 'last-6-months', label: '최근 6개월' },
  { value: 'custom', label: '사용자 지정' },
]

function formatDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return `${year}. ${month}. ${day}.`
}

function requesterLabel(name: string, inactive: boolean) {
  return inactive ? `${name} (비활성)` : name
}

function millisecondsUntilNextBusinessDay(now: Date) {
  // Asia/Seoul day boundary: advance until businessDateKey changes.
  const currentKey = businessDateKey(now)
  let cursor = now.getTime() + 1000
  const limit = now.getTime() + 36 * 60 * 60 * 1000
  while (cursor < limit && businessDateKey(new Date(cursor)) === currentKey) {
    cursor += 60_000
  }
  return Math.max(1000, cursor - now.getTime())
}

export function ReviewStatsPanel({ data, now }: { data: AppData; now?: Date }) {
  const [referenceNow, setReferenceNow] = useState(() => now ?? new Date())

  // 날짜 경계는 필터 조작 중 흔들리지 않되, 화면을 밤새 열어 둔 경우 다음 로컬 날짜에 갱신한다.
  useEffect(() => {
    if (now) return
    const timer = window.setTimeout(
      () => setReferenceNow(new Date()),
      millisecondsUntilNextBusinessDay(referenceNow),
    )
    return () => window.clearTimeout(timer)
  }, [now, referenceNow])
  const [filters, setFilters] = useState<ReviewStatsFilters>(() => {
    const availableRange = getReviewStatsAvailableRange(referenceNow)
    return {
      preset: 'last-6-months',
      requesterId: 'all',
      status: 'all',
      customStartDate: availableRange.minDate,
      customEndDate: availableRange.maxDate,
    }
  })

  // selectReviewStats는 range/requesterOptions/statusCounts처럼 review_requests(현재 상태
  // snapshot, bounded)만으로 정확히 계산되는 부분에만 쓴다. 실제 요청·재요청·승인·반려
  // 건수와 월별 추이는 이제 아래 v2 서버 집계(loadReviewStatsV2View)에서만 가져온다 —
  // review_events는 더 이상 전체 이력을 들고 있지 않으므로 이 값들을
  // stats.kpis/requesterRows/monthlyRows에서 재사용하지 않는다.
  const stats = useMemo(() => selectReviewStats(data, filters, referenceNow), [data, filters, referenceNow])

  const fetchStatistics = useReviewStatisticsV2(data)
  const [view, setView] = useState<ReviewStatsV2LoadState>({ status: 'loading' })
  const [retryToken, setRetryToken] = useState(0)
  const requesterOptionsJson = JSON.stringify(stats.requesterOptions)
  const rangeValid = stats.range.valid
  const rangeStartDate = stats.range.startDate
  const rangeEndDate = stats.range.endDate
  const requesterId = filters.requesterId
  const status = filters.status
  const reviewRequests = data.reviewRequests
  const reviewEvents = data.reviewEvents
  const contentRevision = useMemo(
    () => reviewStatisticsV2ContentRevision({ reviewRequests, reviewEvents }),
    [reviewEvents, reviewRequests],
  )

  useEffect(() => {
    if (!rangeValid) {
      setView({ status: 'ready', refreshing: false, kpis: ZERO_REVIEW_STATS_V2_KPIS, requesterRows: [], monthlyRows: [] })
      return
    }
    let cancelled = false
    // 이미 보여주던 숫자가 있으면 지우지 않고 ‘갱신 중’만 표시한다.
    setView((current) => (current.status === 'ready' ? { ...current, refreshing: true } : { status: 'loading' }))
    loadReviewStatsV2View({
      fetchStatistics,
      range: { startDate: rangeStartDate, endDate: rangeEndDate },
      filters: { requesterId, status },
      requesterOptions: JSON.parse(requesterOptionsJson),
    }).then(
      (result) => {
        if (!cancelled) setView({ status: 'ready', refreshing: false, ...result })
      },
      (error: unknown) => {
        if (!cancelled) setView({ status: 'error', message: toUserMessage(error) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [
    contentRevision,
    fetchStatistics,
    rangeEndDate,
    rangeStartDate,
    rangeValid,
    requesterId,
    requesterOptionsJson,
    retryToken,
    status,
  ])

  const kpis = view.status === 'ready' ? view.kpis : ZERO_REVIEW_STATS_V2_KPIS
  const requesterRows = view.status === 'ready' ? view.requesterRows : []
  const monthlyRows = view.status === 'ready' ? view.monthlyRows : []
  const hasResults = requesterRows.length > 0
  const refreshing = view.status === 'ready' && view.refreshing

  // 데이터 갱신으로 선택한 요청자의 모든 행이 범위 밖으로 사라지면 유효한 전체 선택으로 복구한다.
  useEffect(() => {
    if (filters.requesterId === 'all') return
    if (stats.requesterOptions.some((requester) => requester.id === filters.requesterId)) return
    setFilters((current) =>
      current.requesterId === filters.requesterId ? { ...current, requesterId: 'all' } : current,
    )
  }, [filters.requesterId, stats.requesterOptions])

  const rangeLabel = stats.range.valid
    ? `${formatDateKey(stats.range.startDate)} ~ ${formatDateKey(stats.range.endDate)}`
    : '기간을 다시 골라 주세요'

  const updatePreset = (preset: ReviewStatsPreset) => {
    setFilters((current) => ({ ...current, preset }))
  }

  const errorDetail = view.status === 'error'
    ? view.message === GENERIC_FAILURE_MESSAGE ? '잠시 후 다시 시도해 주세요.' : view.message
    : null

  return (
    <div className="stack review-stats-page">
      <div className="page-intro">
        <h1>검토 통계</h1>
        <p>
          <strong>{rangeLabel}</strong> 동안의 검토요청과 처리 결과예요.
        </p>
      </div>

      <section aria-labelledby="review-stats-filter-title" className="review-stats-filter-panel">
        <div className="review-stats-filter-heading">
          <div>
            <Filter aria-hidden="true" size={18} />
            <h2 id="review-stats-filter-title">통계 필터</h2>
          </div>
          <span className="review-stats-status-chip" data-refreshing={refreshing ? 'true' : undefined} role="status">
            {!stats.range.valid
              ? '기간 확인 필요'
              : view.status === 'loading'
                ? '집계 중…'
                : view.status === 'error'
                  ? '집계하지 못했어요'
                  : refreshing
                    ? '갱신 중…'
                    : `${formatCount(kpis.requestCount)}건 집계`}
          </span>
        </div>

        <div className="review-stats-filter-grid">
          <fieldset className="review-stats-filter-field review-stats-period-field">
            <legend>기간</legend>
            <div aria-label="통계 기간 빠른 선택" className="review-stats-presets" role="group">
              {PRESET_OPTIONS.map((option) => (
                <button
                  aria-controls="review-stats-results"
                  aria-pressed={filters.preset === option.value}
                  key={option.value}
                  onClick={() => updatePreset(option.value)}
                  type="button"
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <label className="review-stats-select-field">
            요청자
            <select
              aria-controls="review-stats-results"
              aria-describedby="review-stats-history-note"
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setFilters((current) => ({ ...current, requesterId: event.target.value }))
              }
              value={filters.requesterId}
            >
              <option value="all">전체 요청자</option>
              {stats.requesterOptions.map((requester) => (
                <option key={requester.id} value={requester.id}>
                  {requesterLabel(requester.name, requester.inactive)}
                </option>
              ))}
            </select>
          </label>

          <label className="review-stats-select-field">
            현재 상태
            <select
              aria-controls="review-stats-results"
              onChange={(event: React.ChangeEvent<HTMLSelectElement>) =>
                setFilters((current) => ({
                  ...current,
                  status: event.target.value as ReviewStatsFilters['status'],
                }))
              }
              value={filters.status}
            >
              <option value="all">모든 상태</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={status} value={status}>
                  {reviewStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filters.preset === 'custom' && (
          <fieldset aria-describedby="review-stats-history-note" className="review-stats-custom-dates">
            <legend>사용자 지정 기간</legend>
            <label>
              시작일
              <input
                aria-controls="review-stats-results"
                max={filters.customEndDate || stats.range.maxDate}
                min={stats.range.minDate}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setFilters((current) => ({ ...current, customStartDate: event.target.value }))
                }
                type="date"
                value={filters.customStartDate}
              />
            </label>
            <span aria-hidden="true">—</span>
            <label>
              종료일
              <input
                aria-controls="review-stats-results"
                max={stats.range.maxDate}
                min={filters.customStartDate || stats.range.minDate}
                onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                  setFilters((current) => ({ ...current, customEndDate: event.target.value }))
                }
                type="date"
                value={filters.customEndDate}
              />
            </label>
          </fieldset>
        )}

        <details className="review-stats-history-note">
          <summary>
            <CalendarDays aria-hidden="true" size={16} />
            집계 기준 보기
          </summary>
          <p id="review-stats-history-note">
            {formatDateKey(stats.range.minDate)}부터 {formatDateKey(stats.range.maxDate)}까지 볼 수 있어요.
            요청·재요청·승인·반려는 실제로 일어난 시각을 기준으로 셌어요. 대기 중과 상태 분포는 이 기간에
            들어온 요청의 지금 상태예요.
          </p>
        </details>

        {!stats.range.valid && (
          <p className="review-stats-validation" role="alert">
            {stats.range.validationMessage}
          </p>
        )}
        {stats.range.wasClamped && (
          <p className="review-stats-validation" role="status">
            볼 수 있는 기간이 최근 6개월이라 기간을 그에 맞게 바꿨어요.
          </p>
        )}
      </section>

      <div aria-busy={refreshing || view.status === 'loading' ? true : undefined} id="review-stats-results">
        {stats.range.valid && view.status === 'ready' && (
          <div
            aria-label="검토 요약 지표"
            className="stats-kpi-grid review-stats-kpi-grid"
            role="region"
          >
            <article aria-label={`요청 건수 ${formatCount(kpis.requestCount)}건`} className="kpi">
              <div className="kpi-label">요청 건수</div>
              <div className="kpi-value">
                {formatCount(kpis.requestCount)}
                <span className="unit">건</span>
              </div>
            </article>
            <article aria-label={`요청 횟수 ${formatCount(kpis.submissionCount)}회`} className="kpi">
              <div className="kpi-label">
                요청 횟수
                <small>재요청 포함</small>
              </div>
              <div className="kpi-value">
                {formatCount(kpis.submissionCount)}
                <span className="unit">회</span>
              </div>
            </article>
            <article aria-label={`재요청 ${formatCount(kpis.resubmissionCount)}회`} className="kpi">
              <div className="kpi-label">재요청</div>
              <div className="kpi-value">
                {formatCount(kpis.resubmissionCount)}
                <span className="unit">회</span>
              </div>
            </article>
            <article aria-label={`${reviewStatusLabels.pending} ${formatCount(kpis.pendingCount)}건`} className="kpi" data-tone="pending">
              <div className="kpi-label">{reviewStatusLabels.pending}</div>
              <div className="kpi-value">
                {formatCount(kpis.pendingCount)}
                <span className="unit">건</span>
              </div>
            </article>
            <article aria-label={`${reviewStatusLabels.approved} ${formatCount(kpis.approvedCount)}건`} className="kpi" data-tone="approved">
              <div className="kpi-label">{reviewStatusLabels.approved}</div>
              <div className="kpi-value">
                {formatCount(kpis.approvedCount)}
                <span className="unit">건</span>
              </div>
            </article>
            <article aria-label={`${reviewStatusLabels.rejected} ${formatCount(kpis.rejectedCount)}건`} className="kpi" data-tone="rejected">
              <div className="kpi-label">{reviewStatusLabels.rejected}</div>
              <div className="kpi-value">
                {formatCount(kpis.rejectedCount)}
                <span className="unit">건</span>
              </div>
            </article>
          </div>
        )}

        {stats.range.valid && view.status === 'loading' && (
          <Section title="통계 결과" icon={<ListChecks size={18} />}>
            <EmptyState
              description="잠시만 기다려 주세요."
              icon={<BarChart3 size={22} />}
              title="통계를 불러오고 있어요"
            />
          </Section>
        )}

        {stats.range.valid && view.status === 'error' && (
          <div className="review-stats-validation review-stats-error" role="alert">
            <AlertTriangle aria-hidden="true" size={16} />
            <p>
              통계를 불러오지 못했어요. {errorDetail}
            </p>
            <button className="ghost compact" onClick={() => setRetryToken((value) => value + 1)} type="button">
              <RotateCcw aria-hidden="true" size={14} />
              다시 시도
            </button>
          </div>
        )}

        {stats.range.valid && view.status === 'ready' && !hasResults && (
          <Section title="통계 결과" icon={<ListChecks size={18} />}>
            <EmptyState
              description="기간이나 요청자, 상태를 바꿔 보세요."
              icon={<BarChart3 size={22} />}
              title="선택한 조건에 맞는 검토 기록이 없어요"
            />
          </Section>
        )}

        {stats.range.valid && view.status === 'ready' && hasResults && (
          <>
            <div className="review-stats-dashboard-grid">
              <Section
                aside={`${formatCount(requesterRows.length)}명`}
                icon={<Users size={18} />}
                title="요청자별 비교"
              >
                <RequesterComparisonChart rows={requesterRows} />
              </Section>

              <Section
                aside={`${formatCount(kpis.requestCount)}건`}
                icon={<PieChart size={18} />}
                title="현재 상태 분포"
              >
                <StatusDistribution counts={stats.statusCounts} />
              </Section>
            </div>

            <Section aside={rangeLabel} icon={<BarChart3 size={18} />} title="월별 추이">
              <MonthlyTrendChart rows={monthlyRows} />
            </Section>

            <Section
              aside="요청 건수와 요청 횟수를 나눠 보여요"
              icon={<Table2 size={18} />}
              title="요청자별 수치"
            >
              <ExactNumbersTable rows={requesterRows} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
