import { businessDateKey } from '../../lib/businessTime'
import { compareDecimalIds } from '../../lib/decimalId'
import type {
  ReviewEvent,
  Profile,
  ReviewRequest,
  ReviewStatisticsV2Envelope,
  ReviewStatisticsV2MonthRow,
  ReviewStatisticsV2MonthlyBreakdownRow,
  ReviewStatisticsV2Params,
  ReviewStatisticsV2RequesterRow,
  ReviewStatus,
} from '../../types'

export type { ReviewStatisticsV2Envelope, ReviewStatisticsV2MonthRow, ReviewStatisticsV2Params }

/**
 * Pure-TS mirror of the `public.get_review_statistics_v2` SQL RPC
 * (supabase/migrations/20260720120000_review_query_stats_v2.sql), used by the
 * local preview data source (no Supabase project) so the stats panel renders
 * an identical envelope shape/semantics whether the numbers came from the
 * server or were computed client-side. Golden-fixture parity tests in
 * reviewStatisticsV2.test.ts assert the two never drift.
 *
 * Every date comparison uses the same Asia/Seoul business-day boundary as the
 * DB (`private.sqa_business_date`/`businessDateKey`), never the browser's
 * local timezone or a bare UTC date slice (D-02).
 */

const STATS_V2_SCHEMA_VERSION = 2 as const
const STATS_V2_TIMEZONE = 'Asia/Seoul' as const
const MAX_RANGE_DAYS = 366
const STATUS_CHANGING_EVENT_TYPES = new Set<ReviewEvent['event_type']>([
  'submitted',
  'resubmitted',
  'approved',
  'rejected',
  'reopened',
  'withdrawn',
])
const STATISTICS_EVENT_TYPES = new Set<ReviewEvent['event_type']>([
  'submitted',
  'resubmitted',
  'approved',
  'rejected',
])

export class ReviewStatisticsV2RangeError extends Error {
  constructor() {
    super('invalid statistics range')
    this.name = 'ReviewStatisticsV2RangeError'
  }
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function isValidDateKey(value: string): boolean {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return false
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // Civil calendar validation must not depend on the host timezone.
  const date = new Date(Date.UTC(year, month - 1, day))
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
}

function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const from = Date.UTC(fy, fm - 1, fd)
  const to = Date.UTC(ty, tm - 1, td)
  return Math.round((to - from) / 86_400_000)
}

function monthStartKey(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`
}

function addMonths(monthStart: string, months: number): string {
  const [year, month] = monthStart.split('-').map(Number)
  const total = year * 12 + (month - 1) + months
  const nextYear = Math.floor(total / 12)
  const nextMonth = (total % 12) + 1
  return `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`
}

function monthEndKey(monthStart: string): string {
  const next = addMonths(monthStart, 1)
  const [year, month] = next.split('-').map(Number)
  // Day 0 of next month = last civil day of current month (UTC calendar math).
  const last = new Date(Date.UTC(year, month - 1, 0))
  return `${last.getUTCFullYear()}-${String(last.getUTCMonth() + 1).padStart(2, '0')}-${String(last.getUTCDate()).padStart(2, '0')}`
}

function monthKeysInRange(fromKey: string, toKey: string): string[] {
  const lastMonth = monthStartKey(toKey)
  const months: string[] = []
  let cursor = monthStartKey(fromKey)
  // Defensive bound: statistics ranges are already capped at MAX_RANGE_DAYS,
  // so this can never exceed ~13 iterations, but guards against a malformed key.
  for (let guard = 0; guard < 400 && cursor <= lastMonth; guard += 1) {
    months.push(cursor)
    cursor = addMonths(cursor, 1)
  }
  return months
}

function eventDateKey(event: ReviewEvent): string | null {
  const timestamp = Date.parse(event.occurred_at)
  return Number.isNaN(timestamp) ? null : businessDateKey(new Date(timestamp))
}

function requestCreatedDateKey(request: ReviewRequest): string | null {
  const timestamp = Date.parse(request.created_at ?? '')
  return Number.isNaN(timestamp) ? null : businessDateKey(new Date(timestamp))
}

function matchesScope(
  request: ReviewRequest | undefined,
  requesterId: string | null,
  status: ReviewStatus | null,
): boolean {
  if (!request) return false
  if (requesterId && request.requester_id !== requesterId) return false
  if (status && request.status !== status) return false
  return true
}

function countEventType(
  events: readonly ReviewEvent[],
  requestById: ReadonlyMap<string, ReviewRequest>,
  eventType: ReviewEvent['event_type'],
  fromKey: string,
  toKey: string,
  requesterId: string | null,
  status: ReviewStatus | null,
): number {
  let count = 0
  for (const event of events) {
    if (event.event_type !== eventType) continue
    if (!matchesScope(requestById.get(event.review_request_id), requesterId, status)) continue
    const dateKey = eventDateKey(event)
    if (dateKey === null || dateKey < fromKey || dateKey > toKey) continue
    count += 1
  }
  return count
}

function pendingCount(
  requests: readonly ReviewRequest[],
  fromKey: string,
  toKey: string,
  requesterId: string | null,
  status: ReviewStatus | null,
): number {
  return requests.filter((request) => {
    if (request.status !== 'pending' || !matchesScope(request, requesterId, status)) return false
    const createdKey = requestCreatedDateKey(request)
    return createdKey !== null && createdKey >= fromKey && createdKey <= toKey
  }).length
}

function buildRequesterBreakdown(
  requests: readonly ReviewRequest[],
  events: readonly ReviewEvent[],
  profiles: readonly Profile[],
  requestById: ReadonlyMap<string, ReviewRequest>,
  fromKey: string,
  toKey: string,
  requesterId: string | null,
  status: ReviewStatus | null,
): ReviewStatisticsV2RequesterRow[] {
  const profileById = new Map(profiles.map((profile) => [profile.id, profile]))
  const requesterIds = new Set<string>()
  for (const request of requests) {
    const createdKey = requestCreatedDateKey(request)
    if (
      createdKey !== null
      && createdKey >= fromKey
      && createdKey <= toKey
      && matchesScope(request, requesterId, status)
    ) requesterIds.add(request.requester_id)
  }
  for (const event of events) {
    const request = requestById.get(event.review_request_id)
    const dateKey = eventDateKey(event)
    if (
      STATISTICS_EVENT_TYPES.has(event.event_type)
      && dateKey !== null
      && dateKey >= fromKey
      && dateKey <= toKey
      && matchesScope(request, requesterId, status)
    ) requesterIds.add(request!.requester_id)
  }

  return [...requesterIds].sort().map((id) => {
    const profile = profileById.get(id)
    const requesterName = profile?.name?.trim() || '알 수 없는 요청자'
    return {
      requester_id: id,
      requester_name: requesterName,
      requester_inactive: profile ? profile.is_active === false : true,
      new_requests: countEventType(events, requestById, 'submitted', fromKey, toKey, id, status),
      resubmissions: countEventType(events, requestById, 'resubmitted', fromKey, toKey, id, status),
      approvals: countEventType(events, requestById, 'approved', fromKey, toKey, id, status),
      rejections: countEventType(events, requestById, 'rejected', fromKey, toKey, id, status),
      pending_count: pendingCount(requests, fromKey, toKey, id, status),
    }
  })
}

/** Status as of `monthEnd`, reconstructed from status-changing events only (mirrors the SQL lateral join). */
function statusAsOfMonthEnd(
  requestId: string,
  eventsByRequest: ReadonlyMap<string, ReviewEvent[]>,
  monthEnd: string,
): ReviewStatus {
  const candidates = (eventsByRequest.get(requestId) ?? []).filter((event) => {
    if (!STATUS_CHANGING_EVENT_TYPES.has(event.event_type) || !event.to_status) return false
    const dateKey = eventDateKey(event)
    return dateKey !== null && dateKey <= monthEnd
  })
  if (candidates.length === 0) return 'pending'
  candidates.sort((left, right) => {
    const leftTime = Date.parse(left.occurred_at)
    const rightTime = Date.parse(right.occurred_at)
    if (leftTime !== rightTime) return leftTime - rightTime
    return compareDecimalIds(left.id, right.id)
  })
  return candidates[candidates.length - 1].to_status as ReviewStatus
}

function buildMonthEndBacklog(
  requests: readonly ReviewRequest[],
  events: readonly ReviewEvent[],
  fromKey: string,
  toKey: string,
  requesterId: string | null,
  status: ReviewStatus | null,
): ReviewStatisticsV2MonthRow[] {
  const eventsByRequest = new Map<string, ReviewEvent[]>()
  for (const event of events) {
    const list = eventsByRequest.get(event.review_request_id)
    if (list) list.push(event)
    else eventsByRequest.set(event.review_request_id, [event])
  }
  const scopedRequests = requests.filter((request) => matchesScope(request, requesterId, status))

  return monthKeysInRange(fromKey, toKey).map((monthStart) => {
    const monthEnd = monthEndKey(monthStart)
    let backlogCount = 0
    for (const request of scopedRequests) {
      const createdKey = requestCreatedDateKey(request)
      if (createdKey === null || createdKey > monthEnd) continue
      if (statusAsOfMonthEnd(request.id, eventsByRequest, monthEnd) === 'pending') backlogCount += 1
    }
    return { month: monthStart.slice(0, 7), business_date: monthEnd, backlog_count: backlogCount }
  })
}

function buildMonthlyBreakdown(
  requests: readonly ReviewRequest[],
  events: readonly ReviewEvent[],
  requestById: ReadonlyMap<string, ReviewRequest>,
  fromKey: string,
  toKey: string,
  requesterId: string | null,
  status: ReviewStatus | null,
  backlog: readonly ReviewStatisticsV2MonthRow[],
): ReviewStatisticsV2MonthlyBreakdownRow[] {
  const backlogByMonth = new Map(backlog.map((row) => [row.month, row.backlog_count]))
  return monthKeysInRange(fromKey, toKey).map((monthStart) => {
    const month = monthStart.slice(0, 7)
    const monthFrom = monthStart < fromKey ? fromKey : monthStart
    const calendarEnd = monthEndKey(monthStart)
    const monthTo = calendarEnd > toKey ? toKey : calendarEnd
    return {
      month,
      new_requests: countEventType(events, requestById, 'submitted', monthFrom, monthTo, requesterId, status),
      resubmissions: countEventType(events, requestById, 'resubmitted', monthFrom, monthTo, requesterId, status),
      approvals: countEventType(events, requestById, 'approved', monthFrom, monthTo, requesterId, status),
      rejections: countEventType(events, requestById, 'rejected', monthFrom, monthTo, requesterId, status),
      month_end_backlog: backlogByMonth.get(month) ?? 0,
    }
  })
}

/** Local-preview/golden-parity counterpart of `public.get_review_statistics_v2`. Leader-only gating happens at the caller. */
export function buildReviewStatisticsV2(
  data: {
    reviewRequests: readonly ReviewRequest[]
    reviewEvents: readonly ReviewEvent[]
    profiles?: readonly Profile[]
  },
  params: ReviewStatisticsV2Params,
  now = new Date(),
): ReviewStatisticsV2Envelope {
  const requesterId = params.requesterId ?? null
  const status = params.status ?? null
  if (
    !isValidDateKey(params.from)
    || !isValidDateKey(params.to)
    || params.from > params.to
    || daysBetween(params.from, params.to) > MAX_RANGE_DAYS
  ) {
    throw new ReviewStatisticsV2RangeError()
  }

  const requestById = new Map(data.reviewRequests.map((request) => [request.id, request]))

  const monthEndBacklog = buildMonthEndBacklog(
    data.reviewRequests,
    data.reviewEvents,
    params.from,
    params.to,
    requesterId,
    status,
  )

  return {
    schema_version: STATS_V2_SCHEMA_VERSION,
    timezone: STATS_V2_TIMEZONE,
    generated_at: now.toISOString(),
    from: params.from,
    to: params.to,
    requester_id: requesterId,
    status,
    new_requests: countEventType(data.reviewEvents, requestById, 'submitted', params.from, params.to, requesterId, status),
    resubmissions: countEventType(data.reviewEvents, requestById, 'resubmitted', params.from, params.to, requesterId, status),
    approvals: countEventType(data.reviewEvents, requestById, 'approved', params.from, params.to, requesterId, status),
    rejections: countEventType(data.reviewEvents, requestById, 'rejected', params.from, params.to, requesterId, status),
    pending_count: pendingCount(data.reviewRequests, params.from, params.to, requesterId, status),
    requester_breakdown: buildRequesterBreakdown(
      data.reviewRequests,
      data.reviewEvents,
      data.profiles ?? [],
      requestById,
      params.from,
      params.to,
      requesterId,
      status,
    ),
    month_end_backlog: monthEndBacklog,
    monthly_breakdown: buildMonthlyBreakdown(
      data.reviewRequests,
      data.reviewEvents,
      requestById,
      params.from,
      params.to,
      requesterId,
      status,
      monthEndBacklog,
    ),
  }
}
