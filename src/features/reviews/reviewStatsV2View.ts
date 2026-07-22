import type { ReviewStatisticsV2Envelope, ReviewStatisticsV2Params, ReviewStatus } from '../../types'
import {
  monthKeysBetween,
  type ReviewStatsFilters,
  type ReviewStatsMonthRow,
  type ReviewStatsRequesterOption,
  type ReviewStatsRequesterRow,
} from './reviewStats.selectors'

export type ReviewStatsV2FetchFn = (params: ReviewStatisticsV2Params) => Promise<ReviewStatisticsV2Envelope>

export type ReviewStatsV2Kpis = {
  requestCount: number
  submissionCount: number
  resubmissionCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
}

export const ZERO_REVIEW_STATS_V2_KPIS: ReviewStatsV2Kpis = {
  requestCount: 0,
  submissionCount: 0,
  resubmissionCount: 0,
  pendingCount: 0,
  approvedCount: 0,
  rejectedCount: 0,
}

export type ReviewStatsV2View = {
  kpis: ReviewStatsV2Kpis
  requesterRows: ReviewStatsRequesterRow[]
  monthlyRows: ReviewStatsMonthRow[]
}

function envelopeToKpis(envelope: ReviewStatisticsV2Envelope): ReviewStatsV2Kpis {
  return {
    requestCount: envelope.new_requests,
    submissionCount: envelope.new_requests + envelope.resubmissions,
    resubmissionCount: envelope.resubmissions,
    pendingCount: envelope.pending_count,
    approvedCount: envelope.approvals,
    rejectedCount: envelope.rejections,
  }
}

function statusParam(status: ReviewStatsFilters['status']): ReviewStatus | undefined {
  return status === 'all' ? undefined : status
}

/** Mirrors the old client selector: a requester only appears once it has some in-view request or event activity. */
function hasAnyActivity(row: ReviewStatsRequesterRow): boolean {
  return (
    row.requestCount > 0 ||
    row.submissionCount > 0 ||
    row.resubmissionCount > 0 ||
    row.pendingCount > 0 ||
    row.approvedCount > 0 ||
    row.rejectedCount > 0
  )
}

function sortRequesterRows(rows: ReviewStatsRequesterRow[]): ReviewStatsRequesterRow[] {
  return [...rows].sort(
    (left, right) =>
      right.requestCount - left.requestCount ||
      right.submissionCount - left.submissionCount ||
      left.requesterName.localeCompare(right.requesterName, 'ko-KR') ||
      left.requesterId.localeCompare(right.requesterId),
  )
}

/**
 * Assembles the review stats panel's view model entirely from
 * `get_review_statistics_v2` (or its local-preview parity builder), never
 * from downloading raw review_events history into the browser.
 *
 * One RPC returns KPI, requester, month-event, and month-end backlog rows
 * from one PostgreSQL statement snapshot. The page therefore never combines
 * aggregates from independently committed HTTP/RPC calls.
 */
export async function loadReviewStatsV2View({
  fetchStatistics,
  range,
  filters,
  requesterOptions,
}: {
  fetchStatistics: ReviewStatsV2FetchFn
  range: { startDate: string; endDate: string }
  filters: ReviewStatsFilters
  requesterOptions: readonly ReviewStatsRequesterOption[]
}): Promise<ReviewStatsV2View> {
  const status = statusParam(filters.status)
  const overallRequesterId = filters.requesterId === 'all' ? undefined : filters.requesterId
  const overallParams: ReviewStatisticsV2Params = {
    from: range.startDate,
    to: range.endDate,
    requesterId: overallRequesterId,
    status,
  }

  const monthKeys = monthKeysBetween(range.startDate, range.endDate)

  const overallEnvelope = await fetchStatistics(overallParams)

  const optionById = new Map(requesterOptions.map((option) => [option.id, option]))
  const requesterRows = sortRequesterRows(
    overallEnvelope.requester_breakdown
      .map((row) => {
        const option = optionById.get(row.requester_id)
        return {
          requesterId: row.requester_id,
          requesterName: row.requester_name || option?.name || '알 수 없는 요청자',
          requesterInactive: row.requester_inactive || option?.inactive === true,
          requestCount: row.new_requests,
          submissionCount: row.new_requests + row.resubmissions,
          resubmissionCount: row.resubmissions,
          pendingCount: row.pending_count,
          approvedCount: row.approvals,
          rejectedCount: row.rejections,
        }
      })
      .filter(hasAnyActivity),
  )

  const monthlyByMonth = new Map(overallEnvelope.monthly_breakdown.map((row) => [row.month, row]))
  const monthlyRows: ReviewStatsMonthRow[] = monthKeys.map((month) => {
    const row = monthlyByMonth.get(month)
    return {
      month,
      requestCount: row?.new_requests ?? 0,
      submissionCount: (row?.new_requests ?? 0) + (row?.resubmissions ?? 0),
      resubmissionCount: row?.resubmissions ?? 0,
      pendingCount: row?.month_end_backlog ?? 0,
      approvedCount: row?.approvals ?? 0,
      rejectedCount: row?.rejections ?? 0,
    }
  })

  return {
    kpis: envelopeToKpis(overallEnvelope),
    requesterRows,
    monthlyRows,
  }
}
