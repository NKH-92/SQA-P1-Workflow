import { reviewStatusLabels } from '../../../lib/format'
import type { ReviewStatus } from '../../../types'
import type { ReviewStatsMonthRow, ReviewStatsRequesterRow } from '../reviewStats.selectors'
import { formatReviewStatsCount, REVIEW_STATS_STATUS_OPTIONS } from '../reviewStatsVisualFormat'

function formatMonth(value: string) {
  const [year, month] = value.split('-')
  return `${year}.${month}`
}

function formatMonthAccessible(value: string) {
  const [year, month] = value.split('-').map(Number)
  return `${year}년 ${month}월`
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

export function RequesterComparisonChart({ rows }: { rows: ReviewStatsRequesterRow[] }) {
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
                요청 {formatReviewStatsCount(row.requestCount)}건 · 제출 {formatReviewStatsCount(row.submissionCount)}회
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
              <strong>{formatReviewStatsCount(row.requestCount)}</strong>
            </div>
            <div aria-hidden="true" className="review-stats-bar-line">
              <span className="review-stats-bar-label">제출</span>
              <span className="review-stats-bar-track">
                <span
                  className="review-stats-bar-fill submission"
                  style={{ width: chartPercent(row.submissionCount, maxValue) }}
                />
              </span>
              <strong>{formatReviewStatsCount(row.submissionCount)}</strong>
            </div>
          </li>
        ))}
      </ol>
    </figure>
  )
}

export function MonthlyTrendChart({ rows }: { rows: ReviewStatsMonthRow[] }) {
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
              aria-label={`${formatMonthAccessible(row.month)} 요청 ${formatReviewStatsCount(row.requestCount)}건, 제출 ${formatReviewStatsCount(row.submissionCount)}회`}
              className="review-stats-month-column"
              key={row.month}
              role="listitem"
            >
              <div aria-hidden="true" className="review-stats-month-column-visual">
                <div className="review-stats-month-values">
                  <span>요청 {formatReviewStatsCount(row.requestCount)}</span>
                  <span>제출 {formatReviewStatsCount(row.submissionCount)}</span>
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

export function StatusDistribution({ counts }: { counts: Record<ReviewStatus, number> }) {
  const total = REVIEW_STATS_STATUS_OPTIONS.reduce((sum, status) => sum + counts[status], 0)

  return (
    <div className="review-stats-status">
      <div className="review-stats-status-track" aria-hidden="true">
        {REVIEW_STATS_STATUS_OPTIONS.map((status) =>
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
      <ul aria-label="현재 검토 상태 분포" className="review-stats-status-list">
        {REVIEW_STATS_STATUS_OPTIONS.map((status) => {
          const percentage = total > 0 ? Math.round((counts[status] / total) * 1000) / 10 : 0
          return (
            <li key={status}>
              <span>
                <i aria-hidden="true" data-status={status} />
                {reviewStatusLabels[status]}
              </span>
              <strong>
                {formatReviewStatsCount(counts[status])}건 <small>{percentage}%</small>
              </strong>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function ExactNumbersTable({ rows }: { rows: ReviewStatsRequesterRow[] }) {
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
        <caption>
          요청·재제출·승인·반려는 서버 이벤트 발생 시각, 현재 대기는 선택 기간에 생성된 요청의 현재 상태를 기준으로
          집계합니다.
        </caption>
        <thead>
          <tr>
            <th scope="col">요청자</th>
            <th scope="col">요청 건수</th>
            <th scope="col">제출 횟수</th>
            <th scope="col">재제출</th>
            <th scope="col">현재 대기</th>
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
              <td>{formatReviewStatsCount(row.requestCount)}</td>
              <td>{formatReviewStatsCount(row.submissionCount)}</td>
              <td>{formatReviewStatsCount(row.resubmissionCount)}</td>
              <td>{formatReviewStatsCount(row.pendingCount)}</td>
              <td>{formatReviewStatsCount(row.approvedCount)}</td>
              <td>{formatReviewStatsCount(row.rejectedCount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <th scope="row">합계</th>
            <td>{formatReviewStatsCount(totals.requestCount)}</td>
            <td>{formatReviewStatsCount(totals.submissionCount)}</td>
            <td>{formatReviewStatsCount(totals.resubmissionCount)}</td>
            <td>{formatReviewStatsCount(totals.pendingCount)}</td>
            <td>{formatReviewStatsCount(totals.approvedCount)}</td>
            <td>{formatReviewStatsCount(totals.rejectedCount)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
