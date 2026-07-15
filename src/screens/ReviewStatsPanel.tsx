import { useEffect, useMemo, useState } from 'react'
import {
  BarChart3,
  CalendarDays,
  Filter,
  ListChecks,
  PieChart,
  Table2,
  Users,
} from 'lucide-react'
import { EmptyState, Section } from '../components/ui'
import {
  getReviewStatsAvailableRange,
  selectReviewStats,
  type ReviewStatsFilters,
  type ReviewStatsMonthRow,
  type ReviewStatsPreset,
  type ReviewStatsRequesterRow,
} from '../features/reviews/reviewStats.selectors'
import { reviewStatusLabels } from '../lib/format'
import type { AppData, ReviewStatus } from '../types'
import './ReviewStatsPanel.css'

const PRESET_OPTIONS: Array<{ value: ReviewStatsPreset; label: string }> = [
  { value: 'this-month', label: '이번 달' },
  { value: 'last-3-months', label: '최근 3개월' },
  { value: 'last-6-months', label: '최근 6개월' },
  { value: 'custom', label: '사용자 지정' },
]

const STATUS_OPTIONS: ReviewStatus[] = ['pending', 'approved', 'rejected']
const numberFormatter = new Intl.NumberFormat('ko-KR')

function formatDateKey(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  if (!year || !month || !day) return value
  return `${year}. ${month}. ${day}.`
}

function formatMonth(value: string) {
  const [year, month] = value.split('-')
  return `${year}.${month}`
}

function formatMonthAccessible(value: string) {
  const [year, month] = value.split('-').map(Number)
  return `${year}년 ${month}월`
}

function formatCount(value: number) {
  return numberFormatter.format(value)
}

function requesterLabel(name: string, inactive: boolean) {
  return inactive ? `${name} (비활성)` : name
}

function millisecondsUntilNextLocalDay(now: Date) {
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return Math.max(1000, nextDay.getTime() - now.getTime())
}

function chartPercent(value: number, maxValue: number) {
  if (!Number.isFinite(value) || !Number.isFinite(maxValue) || value <= 0 || maxValue <= 0) return '0%'
  return `${Math.max(2, (value / maxValue) * 100)}%`
}

function maxSeriesValue(values: number[]) {
  return values.reduce((maxValue, value) => (Number.isFinite(value) ? Math.max(maxValue, value) : maxValue), 0)
}

function RequesterName({ name, inactive }: { name: string; inactive: boolean }) {
  return (
    <span className="review-stats-requester-name">
      <span>{name}</span>
      {inactive && <span className="review-stats-inactive-badge">비활성</span>}
    </span>
  )
}

function RequesterComparisonChart({ rows }: { rows: ReviewStatsRequesterRow[] }) {
  const maxValue = maxSeriesValue(rows.flatMap((row) => [row.requestCount, row.submissionCount]))

  return (
    <figure className="review-stats-figure">
      <figcaption className="review-stats-sr-only">
        요청자별 요청 건수와 재제출을 포함한 제출 횟수 비교
      </figcaption>
      <div className="review-stats-chart-legend" aria-hidden="true">
        <span>
          <i className="review-stats-swatch request" /> 요청 건수
        </span>
        <span>
          <i className="review-stats-swatch submission" /> 제출 횟수
        </span>
      </div>
      <ol className="review-stats-requester-bars">
        {rows.map((row) => (
          <li key={row.requesterId}>
            <div className="review-stats-requester-heading">
              <strong>
                <RequesterName name={row.requesterName} inactive={row.requesterInactive} />
              </strong>
              <span>
                요청 {formatCount(row.requestCount)}건 · 제출 {formatCount(row.submissionCount)}회
              </span>
            </div>
            <div aria-hidden="true" className="review-stats-bar-line">
              <span className="review-stats-bar-label">요청</span>
              <span className="review-stats-bar-track">
                <span
                  className="review-stats-bar-fill request"
                  style={{ width: chartPercent(row.requestCount, maxValue) }}
                />
              </span>
              <strong>{formatCount(row.requestCount)}</strong>
            </div>
            <div aria-hidden="true" className="review-stats-bar-line">
              <span className="review-stats-bar-label">제출</span>
              <span className="review-stats-bar-track">
                <span
                  className="review-stats-bar-fill submission"
                  style={{ width: chartPercent(row.submissionCount, maxValue) }}
                />
              </span>
              <strong>{formatCount(row.submissionCount)}</strong>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  )
}

function MonthlyTrendChart({ rows }: { rows: ReviewStatsMonthRow[] }) {
  const maxValue = maxSeriesValue(rows.flatMap((row) => [row.requestCount, row.submissionCount]))

  return (
    <figure className="review-stats-figure">
      <figcaption className="review-stats-sr-only">
        선택 기간의 월별 요청 건수와 재제출을 포함한 제출 횟수 추이
      </figcaption>
      <div className="review-stats-chart-legend" aria-hidden="true">
        <span>
          <i className="review-stats-swatch request" /> 요청 건수
        </span>
        <span>
          <i className="review-stats-swatch submission" /> 제출 횟수
        </span>
      </div>
      <div
        aria-label="월별 검토 추이 그래프. 각 월의 요청 건수와 제출 횟수를 확인할 수 있습니다."
        className="review-stats-month-scroll"
        role="region"
        tabIndex={0}
      >
        <div className="review-stats-month-chart" role="list">
          {rows.map((row) => (
            <div
              aria-label={`${formatMonthAccessible(row.month)} 요청 ${formatCount(row.requestCount)}건, 제출 ${formatCount(row.submissionCount)}회`}
              className="review-stats-month-column"
              key={row.month}
              role="listitem"
            >
              <div aria-hidden="true" className="review-stats-month-column-visual">
                <div className="review-stats-month-values">
                  <span>요청 {formatCount(row.requestCount)}</span>
                  <span>제출 {formatCount(row.submissionCount)}</span>
                </div>
                <div className="review-stats-month-bars">
                  <span
                    className="review-stats-month-bar request"
                    style={{ height: chartPercent(row.requestCount, maxValue) }}
                  />
                  <span
                    className="review-stats-month-bar submission"
                    style={{ height: chartPercent(row.submissionCount, maxValue) }}
                  />
                </div>
                <strong>{formatMonth(row.month)}</strong>
              </div>
            </div>
          ))}
        </div>
      </div>
    </figure>
  )
}

function StatusDistribution({ counts }: { counts: Record<ReviewStatus, number> }) {
  const total = STATUS_OPTIONS.reduce((sum, status) => sum + counts[status], 0)

  return (
    <div className="review-stats-status">
      <div className="review-stats-status-track" aria-hidden="true">
        {STATUS_OPTIONS.map((status) =>
          counts[status] > 0 ? (
            <span
              className="review-stats-status-segment"
              data-status={status}
              key={status}
              style={{ flexGrow: counts[status] }}
            />
          ) : null,
        )}
      </div>
      <ul aria-label="검토 상태 분포" className="review-stats-status-list">
        {STATUS_OPTIONS.map((status) => {
          const percentage = total > 0 ? Math.round((counts[status] / total) * 1000) / 10 : 0
          return (
            <li key={status}>
              <span>
                <i aria-hidden="true" data-status={status} />
                {reviewStatusLabels[status]}
              </span>
              <strong>
                {formatCount(counts[status])}건 <small>{percentage}%</small>
              </strong>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function ExactNumbersTable({ rows }: { rows: ReviewStatsRequesterRow[] }) {
  const totals = rows.reduce(
    (result, row) => ({
      requestCount: result.requestCount + row.requestCount,
      submissionCount: result.submissionCount + row.submissionCount,
      resubmissionCount: result.resubmissionCount + row.resubmissionCount,
      pendingCount: result.pendingCount + row.pendingCount,
      approvedCount: result.approvedCount + row.approvedCount,
      rejectedCount: result.rejectedCount + row.rejectedCount,
    }),
    {
      requestCount: 0,
      submissionCount: 0,
      resubmissionCount: 0,
      pendingCount: 0,
      approvedCount: 0,
      rejectedCount: 0,
    },
  )

  return (
    <div
      aria-label="요청자별 검토 통계 표. 화면이 좁으면 좌우로 스크롤할 수 있습니다."
      className="review-stats-table-scroll"
      role="region"
      tabIndex={0}
    >
      <table className="review-stats-table">
        <caption>요청 건수는 행 수, 제출 횟수는 각 행의 review_round 합계이며 값이 없거나 유효하지 않으면 1회로 계산합니다.</caption>
        <thead>
          <tr>
            <th scope="col">요청자</th>
            <th scope="col">요청 건수</th>
            <th scope="col">제출 횟수</th>
            <th scope="col">재제출</th>
            <th scope="col">대기</th>
            <th scope="col">승인</th>
            <th scope="col">반려</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.requesterId}>
              <th scope="row">
                <RequesterName name={row.requesterName} inactive={row.requesterInactive} />
              </th>
              <td>{formatCount(row.requestCount)}</td>
              <td>{formatCount(row.submissionCount)}</td>
              <td>{formatCount(row.resubmissionCount)}</td>
              <td>{formatCount(row.pendingCount)}</td>
              <td>{formatCount(row.approvedCount)}</td>
              <td>{formatCount(row.rejectedCount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">합계</th>
            <td>{formatCount(totals.requestCount)}</td>
            <td>{formatCount(totals.submissionCount)}</td>
            <td>{formatCount(totals.resubmissionCount)}</td>
            <td>{formatCount(totals.pendingCount)}</td>
            <td>{formatCount(totals.approvedCount)}</td>
            <td>{formatCount(totals.rejectedCount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export function ReviewStatsPanel({ data }: { data: AppData }) {
  const [referenceNow, setReferenceNow] = useState(() => new Date())

  // 날짜 경계는 필터 조작 중 흔들리지 않되, 화면을 밤새 열어 둔 경우 다음 로컬 날짜에 갱신한다.
  useEffect(() => {
    const timer = window.setTimeout(
      () => setReferenceNow(new Date()),
      millisecondsUntilNextLocalDay(referenceNow),
    )
    return () => window.clearTimeout(timer)
  }, [referenceNow])
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

  const stats = useMemo(() => selectReviewStats(data, filters, referenceNow), [data, filters, referenceNow])

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
    : '기간을 확인해 주세요.'

  const updatePreset = (preset: ReviewStatsPreset) => {
    setFilters((current) => ({ ...current, preset }))
  }

  return (
    <div className="stack review-stats-page">
      <div className="page-intro">
        <h1>검토 통계</h1>
        <p>
          요청 생성일 기준 · <strong>{rangeLabel}</strong>
        </p>
      </div>

      <section aria-labelledby="review-stats-filter-title" className="review-stats-filter-panel">
        <div className="review-stats-filter-heading">
          <div>
            <Filter aria-hidden="true" size={18} />
            <h2 id="review-stats-filter-title">통계 필터</h2>
          </div>
          <span aria-live="polite" role="status">
            {stats.range.valid ? `${formatCount(stats.kpis.requestCount)}건 집계` : '기간 오류'}
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
            상태
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
              <option value="all">전체 상태</option>
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

        <p className="review-stats-history-note" id="review-stats-history-note">
          <CalendarDays aria-hidden="true" size={16} />
          완료 데이터는 조회 시각 기준 최근 6개월만 로드됩니다. 최초 경계일의 일부 시간대가 누락되지 않도록 완전히
          로드된 {formatDateKey(stats.range.minDate)}부터 {formatDateKey(stats.range.maxDate)}까지 집계하며, 더 오래된 대기
          요청도 통계에서는 제외합니다. 월별 제출 횟수는 요청 생성월에 각 행의 review_round 합계를 배치하며, 값이 없거나 유효하지 않으면 최초 제출 1회로 계산합니다.
        </p>

        {!stats.range.valid && (
          <p className="review-stats-validation" role="alert">
            {stats.range.validationMessage}
          </p>
        )}
        {stats.range.wasClamped && (
          <p className="review-stats-validation" role="status">
            조회 가능한 최근 6개월 범위에 맞춰 기간을 조정했습니다.
          </p>
        )}
      </section>

      <div id="review-stats-results">
        {stats.range.valid && (
          <div
            aria-label="검토 요약 지표"
            className="stats-kpi-grid review-stats-kpi-grid"
            role="region"
          >
            <article aria-label={`요청 건수 ${formatCount(stats.kpis.requestCount)}건`} className="kpi">
              <div className="kpi-label">요청 건수</div>
              <div className="kpi-value">
                {formatCount(stats.kpis.requestCount)}
                <span className="unit">건</span>
              </div>
            </article>
            <article aria-label={`제출 횟수 ${formatCount(stats.kpis.submissionCount)}회`} className="kpi">
              <div className="kpi-label">제출 횟수</div>
              <div className="kpi-value">
                {formatCount(stats.kpis.submissionCount)}
                <span className="unit">회</span>
              </div>
            </article>
            <article aria-label={`재제출 ${formatCount(stats.kpis.resubmissionCount)}회`} className="kpi">
              <div className="kpi-label">재제출</div>
              <div className="kpi-value">
                {formatCount(stats.kpis.resubmissionCount)}
                <span className="unit">회</span>
              </div>
            </article>
            <article aria-label={`대기 ${formatCount(stats.kpis.pendingCount)}건`} className="kpi" data-tone="pending">
              <div className="kpi-label">대기</div>
              <div className="kpi-value">
                {formatCount(stats.kpis.pendingCount)}
                <span className="unit">건</span>
              </div>
            </article>
            <article aria-label={`승인 ${formatCount(stats.kpis.approvedCount)}건`} className="kpi" data-tone="approved">
              <div className="kpi-label">승인</div>
              <div className="kpi-value">
                {formatCount(stats.kpis.approvedCount)}
                <span className="unit">건</span>
              </div>
            </article>
            <article aria-label={`반려 ${formatCount(stats.kpis.rejectedCount)}건`} className="kpi" data-tone="rejected">
              <div className="kpi-label">반려</div>
              <div className="kpi-value">
                {formatCount(stats.kpis.rejectedCount)}
                <span className="unit">건</span>
              </div>
            </article>
          </div>
        )}

        {stats.range.valid && stats.kpis.requestCount === 0 && (
          <Section title="통계 결과" icon={<ListChecks size={18} />}>
            <EmptyState
              description="기간, 요청자 또는 상태 필터를 바꾸어 다시 확인해 보세요."
              icon={<BarChart3 size={22} />}
              title="선택한 조건에 해당하는 검토 데이터가 없습니다."
            />
          </Section>
        )}

        {stats.range.valid && stats.kpis.requestCount > 0 && (
          <>
            <div className="review-stats-dashboard-grid">
              <Section
                aside={`${formatCount(stats.requesterRows.length)}명`}
                icon={<Users size={18} />}
                title="요청자별 비교"
              >
                <RequesterComparisonChart rows={stats.requesterRows} />
              </Section>

              <Section
                aside={`${formatCount(stats.kpis.requestCount)}건`}
                icon={<PieChart size={18} />}
                title="상태 분포"
              >
                <StatusDistribution counts={stats.statusCounts} />
              </Section>
            </div>

            <Section aside={rangeLabel} icon={<BarChart3 size={18} />} title="월별 추이">
              <MonthlyTrendChart rows={stats.monthlyRows} />
            </Section>

            <Section
              aside="요청 건수와 제출 횟수를 구분"
              icon={<Table2 size={18} />}
              title="요청자별 정확한 수치"
            >
              <ExactNumbersTable rows={stats.requesterRows} />
            </Section>
          </>
        )}
      </div>
    </div>
  )
}
