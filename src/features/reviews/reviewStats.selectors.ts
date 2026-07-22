import { businessDateKey, businessDateParts } from '../../lib/businessTime'
import { compareDecimalIds } from '../../lib/decimalId'
import type { AppData, Profile, ReviewEvent, ReviewRequest, ReviewStatus } from '../../types'

export const REVIEW_STATS_HISTORY_MONTHS = 6

export const REVIEW_STATS_PRESETS = ['this-month', 'last-3-months', 'last-6-months', 'custom'] as const
export type ReviewStatsPreset = (typeof REVIEW_STATS_PRESETS)[number]
export type ReviewStatsStatusFilter = 'all' | ReviewStatus

export type ReviewStatsFilters = {
  preset: ReviewStatsPreset
  requesterId: 'all' | string
  status: ReviewStatsStatusFilter
  customStartDate: string
  customEndDate: string
}

export type ReviewStatsRange = {
  minDate: string
  maxDate: string
  startDate: string
  endDate: string
  valid: boolean
  wasClamped: boolean
  validationMessage: string | null
}

export type ReviewStatsRequesterOption = {
  id: string
  name: string
  inactive: boolean
}

export type ReviewStatsRequesterRow = {
  requesterId: string
  requesterName: string
  requesterInactive: boolean
  requestCount: number
  submissionCount: number
  resubmissionCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
}

export type ReviewStatsScopes = {
  currentStateRequests: readonly ReviewRequest[]
  periodEvents: readonly ReviewEvent[]
}

export type ReviewStatsMonthRow = {
  month: string
  requestCount: number
  submissionCount: number
  resubmissionCount: number
  pendingCount: number
  approvedCount: number
  rejectedCount: number
}

export type ReviewStatsResult = {
  range: ReviewStatsRange
  requesterOptions: ReviewStatsRequesterOption[]
  filteredRequests: ReviewRequest[]
  kpis: {
    requestCount: number
    submissionCount: number
    resubmissionCount: number
    pendingCount: number
    approvedCount: number
    rejectedCount: number
  }
  requesterRows: ReviewStatsRequesterRow[]
  monthlyRows: ReviewStatsMonthRow[]
  statusCounts: Record<ReviewStatus, number>
}

type RequesterIdentity = {
  name: string
  inactive: boolean
}

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
const STATUS_ORDER: ReviewStatus[] = ['pending', 'approved', 'rejected', 'withdrawn']
const UNKNOWN_REQUESTER_NAME = '알 수 없는 요청자'

function toDateKey(date: Date): string {
  return businessDateKey(date)
}

function parseDateKey(value: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // Construct a UTC instant that lands on the intended Asia/Seoul civil date at noon KST.
  const date = new Date(Date.UTC(year, month - 1, day, 3, 0, 0))
  const parts = businessDateParts(date)
  if (parts.year !== year || parts.month !== month || parts.day !== day) return null
  return date
}

function requestDateKey(request: ReviewRequest): string | null {
  const timestamp = Date.parse(request.created_at ?? '')
  return Number.isNaN(timestamp) ? null : toDateKey(new Date(timestamp))
}

function clampDateKey(value: string, minDate: string, maxDate: string): string {
  if (value < minDate) return minDate
  if (value > maxDate) return maxDate
  return value
}

/** fetchAppData.reviewHistoryCutoff과 같은 UTC 월 이동/월말 보정 규칙이다. */
function historyCutoffInstant(now: Date): Date {
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - REVIEW_STATS_HISTORY_MONTHS)
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff
}

/**
 * 완료 행은 cutoff 시각 이후만 로드된다. 날짜 필터가 하루 전체를 포함한다고 말하려면
 * cutoff가 걸친 부분 날짜를 제외하고 다음 Asia/Seoul 업무일부터 제공해야 한다.
 */
function firstFullyLoadedBusinessDate(now: Date): Date {
  const cutoff = historyCutoffInstant(now)
  const parts = businessDateParts(cutoff)
  if (parts.hour === 0 && parts.minute === 0 && parts.second === 0) {
    return parseDateKey(toDateKey(cutoff)) ?? cutoff
  }
  // Advance one Asia/Seoul civil day from the cutoff's business date.
  const next = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1, 3, 0, 0))
  return parseDateKey(toDateKey(next)) ?? next
}

function subtractBusinessMonthsClamped(now: Date, months: number): Date {
  const parts = businessDateParts(now)
  let year = parts.year
  let month = parts.month - months
  while (month <= 0) {
    month += 12
    year -= 1
  }
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const day = Math.min(parts.day, lastDay)
  return parseDateKey(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    ?? new Date(Date.UTC(year, month - 1, day, 3, 0, 0))
}

export function getReviewStatsAvailableRange(now = new Date()) {
  return {
    minDate: toDateKey(firstFullyLoadedBusinessDate(now)),
    maxDate: toDateKey(now),
  }
}

export function resolveReviewStatsRange(filters: ReviewStatsFilters, now = new Date()): ReviewStatsRange {
  const { minDate, maxDate } = getReviewStatsAvailableRange(now)

  if (filters.preset === 'this-month') {
    const parts = businessDateParts(now)
    const startOfMonth = `${parts.year}-${String(parts.month).padStart(2, '0')}-01`
    return {
      minDate,
      maxDate,
      startDate: clampDateKey(startOfMonth, minDate, maxDate),
      endDate: maxDate,
      valid: true,
      wasClamped: startOfMonth < minDate,
      validationMessage: null,
    }
  }

  if (filters.preset === 'last-3-months') {
    const requestedStart = toDateKey(subtractBusinessMonthsClamped(now, 3))
    return {
      minDate,
      maxDate,
      startDate: clampDateKey(requestedStart, minDate, maxDate),
      endDate: maxDate,
      valid: true,
      wasClamped: requestedStart < minDate,
      validationMessage: null,
    }
  }

  if (filters.preset === 'last-6-months') {
    return {
      minDate,
      maxDate,
      startDate: minDate,
      endDate: maxDate,
      valid: true,
      wasClamped: false,
      validationMessage: null,
    }
  }

  const startIsValid = parseDateKey(filters.customStartDate) !== null
  const endIsValid = parseDateKey(filters.customEndDate) !== null
  if (!startIsValid || !endIsValid) {
    return {
      minDate,
      maxDate,
      startDate: filters.customStartDate || minDate,
      endDate: filters.customEndDate || maxDate,
      valid: false,
      wasClamped: false,
      validationMessage: '시작일과 종료일을 모두 선택해 주세요.',
    }
  }

  if (filters.customStartDate > filters.customEndDate) {
    return {
      minDate,
      maxDate,
      startDate: filters.customStartDate,
      endDate: filters.customEndDate,
      valid: false,
      wasClamped: false,
      validationMessage: '시작일은 종료일보다 늦을 수 없습니다.',
    }
  }

  const startDate = clampDateKey(filters.customStartDate, minDate, maxDate)
  const endDate = clampDateKey(filters.customEndDate, minDate, maxDate)
  const overlapsAvailableRange = filters.customEndDate >= minDate && filters.customStartDate <= maxDate
  return {
    minDate,
    maxDate,
    startDate,
    endDate,
    valid: overlapsAvailableRange,
    wasClamped: startDate !== filters.customStartDate || endDate !== filters.customEndDate,
    validationMessage: overlapsAvailableRange
      ? null
      : '선택한 기간이 조회 가능한 최근 6개월 범위와 겹치지 않습니다.',
  }
}

export function reviewSubmissionCount(request: ReviewRequest): number {
  const round = request.review_round
  return typeof round === 'number' && Number.isFinite(round) && round >= 1 ? Math.floor(round) : 1
}

function displayName(profile: Pick<Profile, 'name' | 'email'> | null | undefined): string {
  const name = profile?.name?.trim()
  if (name) return name
  const email = profile?.email?.trim()
  return email || UNKNOWN_REQUESTER_NAME
}

function requesterIdentityMap(profiles: Profile[], requests: ReviewRequest[]): Map<string, RequesterIdentity> {
  const identities = new Map<string, RequesterIdentity>()
  for (const profile of profiles) {
    identities.set(profile.id, {
      name: displayName(profile),
      inactive: profile.is_active === false,
    })
  }
  for (const request of requests) {
    if (!identities.has(request.requester_id)) {
      identities.set(request.requester_id, {
        name: displayName(request.profiles),
        inactive: false,
      })
    }
  }
  return identities
}

function statusCounts(requests: ReviewRequest[]): Record<ReviewStatus, number> {
  return requests.reduce<Record<ReviewStatus, number>>(
    (counts, request) => {
      counts[request.status] += 1
      return counts
    },
    { pending: 0, approved: 0, rejected: 0, withdrawn: 0 },
  )
}

function buildRequesterRows({
  currentStateRequests,
  periodEvents,
  identities,
  requestById,
}: ReviewStatsScopes & {
  identities: ReadonlyMap<string, RequesterIdentity>
  requestById: ReadonlyMap<string, ReviewRequest>
}): ReviewStatsRequesterRow[] {
  const requestsByRequester = new Map<string, ReviewRequest[]>()
  const eventsByRequester = new Map<string, ReviewEvent[]>()
  const requesterIds = new Set<string>()

  for (const request of currentStateRequests) {
    requesterIds.add(request.requester_id)
    const current = requestsByRequester.get(request.requester_id)
    if (current) current.push(request)
    else requestsByRequester.set(request.requester_id, [request])
  }

  for (const event of periodEvents) {
    const request = requestById.get(event.review_request_id)
    if (!request) continue
    requesterIds.add(request.requester_id)
    const current = eventsByRequester.get(request.requester_id)
    if (current) current.push(event)
    else eventsByRequester.set(request.requester_id, [event])
  }

  return [...requesterIds]
    .map((requesterId) => {
      const requesterRequests = requestsByRequester.get(requesterId) ?? []
      const requesterEvents = eventsByRequester.get(requesterId) ?? []
      const counts = statusCounts(requesterRequests)
      const requestCount = requesterEvents.filter((event) => event.event_type === 'submitted').length
      const resubmissionCount = requesterEvents.filter((event) => event.event_type === 'resubmitted').length
      const submissionCount = requestCount + resubmissionCount
      const identity = identities.get(requesterId) ?? { name: UNKNOWN_REQUESTER_NAME, inactive: false }
      return {
        requesterId,
        requesterName: identity.name,
        requesterInactive: identity.inactive,
        requestCount,
        submissionCount,
        resubmissionCount,
        pendingCount: counts.pending,
        approvedCount: requesterEvents.filter((event) => event.event_type === 'approved').length,
        rejectedCount: requesterEvents.filter((event) => event.event_type === 'rejected').length,
      }
    })
    .sort(
      (left, right) =>
        right.requestCount - left.requestCount ||
        right.submissionCount - left.submissionCount ||
        left.requesterName.localeCompare(right.requesterName, 'ko-KR') ||
        left.requesterId.localeCompare(right.requesterId),
    )
}

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7)
}

export function monthKeysBetween(startDate: string, endDate: string): string[] {
  const start = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  if (!start || !end || start > end) return []

  let { year, month } = businessDateParts(start)
  const endParts = businessDateParts(end)
  const months: string[] = []
  while (year < endParts.year || (year === endParts.year && month <= endParts.month)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`)
    month += 1
    if (month > 12) {
      month = 1
      year += 1
    }
  }
  return months
}

function buildMonthlyRows(events: ReviewEvent[], range: ReviewStatsRange): ReviewStatsMonthRow[] {
  const byMonth = new Map<string, ReviewEvent[]>()
  for (const event of events) {
    const timestamp = Date.parse(event.occurred_at)
    if (Number.isNaN(timestamp)) continue
    const month = monthKeyFromDateKey(toDateKey(new Date(timestamp)))
    const current = byMonth.get(month)
    if (current) current.push(event)
    else byMonth.set(month, [event])
  }

  return monthKeysBetween(range.startDate, range.endDate).map((month) => {
    const monthEvents = byMonth.get(month) ?? []
    const requestCount = monthEvents.filter((event) => event.event_type === 'submitted').length
    const resubmissionCount = monthEvents.filter((event) => event.event_type === 'resubmitted').length
    const latestStatusByRequest = new Map<string, ReviewEvent>()
    for (const event of monthEvents) {
      if (!event.to_status) continue
      const current = latestStatusByRequest.get(event.review_request_id)
      if (!current || compareDecimalIds(event.id, current.id) > 0) latestStatusByRequest.set(event.review_request_id, event)
    }
    return {
      month,
      requestCount,
      submissionCount: requestCount + resubmissionCount,
      resubmissionCount,
      pendingCount: [...latestStatusByRequest.values()].filter((event) => event.to_status === 'pending').length,
      approvedCount: monthEvents.filter((event) => event.event_type === 'approved').length,
      rejectedCount: monthEvents.filter((event) => event.event_type === 'rejected').length,
    }
  })
}

export function selectReviewStats(
  data: Pick<AppData, 'profiles' | 'reviewRequests' | 'reviewEvents'>,
  filters: ReviewStatsFilters,
  now = new Date(),
): ReviewStatsResult {
  const range = resolveReviewStatsRange(filters, now)
  const identities = requesterIdentityMap(data.profiles, data.reviewRequests)
  const requestById = new Map(data.reviewRequests.map((request) => [request.id, request]))

  // 대기 요청은 6개월보다 오래된 행도 로드될 수 있으므로 통계 선택지와 결과에 동일 경계를 적용한다.
  const availableRequests = data.reviewRequests.filter((request) => {
    const dateKey = requestDateKey(request)
    return dateKey !== null && dateKey >= range.minDate && dateKey <= range.maxDate
  })

  const availableEventRequesterIds = (data.reviewEvents ?? []).flatMap((event) => {
    if (event.event_type === 'withdrawn') return []
    const request = requestById.get(event.review_request_id)
    if (!request) return []
    const timestamp = Date.parse(event.occurred_at)
    if (Number.isNaN(timestamp)) return []
    const dateKey = toDateKey(new Date(timestamp))
    return dateKey >= range.minDate && dateKey <= range.maxDate ? [request.requester_id] : []
  })
  const requesterOptions = [
    ...new Set([
      ...availableRequests.map((request) => request.requester_id),
      ...availableEventRequesterIds,
    ]),
  ]
    .map((id) => {
      const identity = identities.get(id) ?? { name: UNKNOWN_REQUESTER_NAME, inactive: false }
      return { id, name: identity.name, inactive: identity.inactive }
    })
    .sort(
      (left, right) => left.name.localeCompare(right.name, 'ko-KR') || left.id.localeCompare(right.id),
    )

  const filteredRequests = range.valid
    ? availableRequests.filter((request) => {
        const dateKey = requestDateKey(request)
        if (dateKey === null || dateKey < range.startDate || dateKey > range.endDate) return false
        if (filters.requesterId !== 'all' && request.requester_id !== filters.requesterId) return false
        return filters.status === 'all' || request.status === filters.status
      })
    : []

  const eventScopedRequests = data.reviewRequests.filter((request) => {
    if (filters.requesterId !== 'all' && request.requester_id !== filters.requesterId) return false
    return filters.status === 'all' || request.status === filters.status
  })
  const filteredRequestIds = new Set(eventScopedRequests.map((request) => request.id))
  const filteredEvents = range.valid
    ? (data.reviewEvents ?? []).filter((event) => {
        if (!filteredRequestIds.has(event.review_request_id) || event.event_type === 'withdrawn') return false
        const timestamp = Date.parse(event.occurred_at)
        if (Number.isNaN(timestamp)) return false
        const dateKey = toDateKey(new Date(timestamp))
        return dateKey >= range.startDate && dateKey <= range.endDate
      })
    : []

  const counts = statusCounts(filteredRequests)
  const requestCount = filteredEvents.filter((event) => event.event_type === 'submitted').length
  const resubmissionCount = filteredEvents.filter((event) => event.event_type === 'resubmitted').length
  const submissionCount = requestCount + resubmissionCount
  const requesterRows = buildRequesterRows({
    currentStateRequests: filteredRequests,
    periodEvents: filteredEvents,
    identities,
    requestById,
  })

  return {
    range,
    requesterOptions,
    filteredRequests,
    kpis: {
      requestCount,
      submissionCount,
      resubmissionCount,
      pendingCount: counts.pending,
      approvedCount: filteredEvents.filter((event) => event.event_type === 'approved').length,
      rejectedCount: filteredEvents.filter((event) => event.event_type === 'rejected').length,
    },
    requesterRows,
    monthlyRows: range.valid ? buildMonthlyRows(filteredEvents, range) : [],
    statusCounts: STATUS_ORDER.reduce<Record<ReviewStatus, number>>(
      (result, status) => {
        result[status] = counts[status]
        return result
      },
      { pending: 0, approved: 0, rejected: 0, withdrawn: 0 },
    ),
  }
}
