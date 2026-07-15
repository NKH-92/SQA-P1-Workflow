import type { AppData, Profile, ReviewRequest, ReviewStatus } from '../../types'

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
const STATUS_ORDER: ReviewStatus[] = ['pending', 'approved', 'rejected']
const UNKNOWN_REQUESTER_NAME = '알 수 없는 요청자'

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function parseDateKey(value: string): Date | null {
  const match = DATE_KEY_PATTERN.exec(value)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day, 12)
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null
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
 * cutoff가 걸친 부분 날짜를 제외하고 다음 로컬 날짜부터 제공해야 한다.
 */
function firstFullyLoadedLocalDate(now: Date): Date {
  const cutoff = historyCutoffInstant(now)
  const isLocalMidnight =
    cutoff.getHours() === 0 &&
    cutoff.getMinutes() === 0 &&
    cutoff.getSeconds() === 0 &&
    cutoff.getMilliseconds() === 0
  if (isLocalMidnight) return cutoff
  return new Date(cutoff.getFullYear(), cutoff.getMonth(), cutoff.getDate() + 1, 12)
}

function subtractLocalMonthsClamped(now: Date, months: number): Date {
  const day = now.getDate()
  const result = new Date(now.getFullYear(), now.getMonth(), 1, 12)
  result.setMonth(result.getMonth() - months)
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0, 12).getDate()
  result.setDate(Math.min(day, lastDay))
  return result
}

export function getReviewStatsAvailableRange(now = new Date()) {
  return {
    minDate: toDateKey(firstFullyLoadedLocalDate(now)),
    maxDate: toDateKey(now),
  }
}

export function resolveReviewStatsRange(filters: ReviewStatsFilters, now = new Date()): ReviewStatsRange {
  const { minDate, maxDate } = getReviewStatsAvailableRange(now)

  if (filters.preset === 'this-month') {
    const startOfMonth = toDateKey(new Date(now.getFullYear(), now.getMonth(), 1, 12))
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
    const requestedStart = toDateKey(subtractLocalMonthsClamped(now, 3))
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
    { pending: 0, approved: 0, rejected: 0 },
  )
}

function buildRequesterRows(
  requests: ReviewRequest[],
  identities: Map<string, RequesterIdentity>,
): ReviewStatsRequesterRow[] {
  const grouped = new Map<string, ReviewRequest[]>()
  for (const request of requests) {
    const current = grouped.get(request.requester_id)
    if (current) current.push(request)
    else grouped.set(request.requester_id, [request])
  }

  return [...grouped.entries()]
    .map(([requesterId, requesterRequests]) => {
      const counts = statusCounts(requesterRequests)
      const submissionCount = requesterRequests.reduce((sum, request) => sum + reviewSubmissionCount(request), 0)
      const identity = identities.get(requesterId) ?? { name: UNKNOWN_REQUESTER_NAME, inactive: false }
      return {
        requesterId,
        requesterName: identity.name,
        requesterInactive: identity.inactive,
        requestCount: requesterRequests.length,
        submissionCount,
        resubmissionCount: Math.max(0, submissionCount - requesterRequests.length),
        pendingCount: counts.pending,
        approvedCount: counts.approved,
        rejectedCount: counts.rejected,
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

function monthKeysBetween(startDate: string, endDate: string): string[] {
  const start = parseDateKey(startDate)
  const end = parseDateKey(endDate)
  if (!start || !end || start > end) return []

  const cursor = new Date(start.getFullYear(), start.getMonth(), 1, 12)
  const last = new Date(end.getFullYear(), end.getMonth(), 1, 12)
  const months: string[] = []
  while (cursor <= last) {
    months.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)
    cursor.setMonth(cursor.getMonth() + 1)
  }
  return months
}

function buildMonthlyRows(requests: ReviewRequest[], range: ReviewStatsRange): ReviewStatsMonthRow[] {
  const byMonth = new Map<string, ReviewRequest[]>()
  for (const request of requests) {
    const dateKey = requestDateKey(request)
    if (!dateKey) continue
    const month = monthKeyFromDateKey(dateKey)
    const current = byMonth.get(month)
    if (current) current.push(request)
    else byMonth.set(month, [request])
  }

  return monthKeysBetween(range.startDate, range.endDate).map((month) => {
    const monthRequests = byMonth.get(month) ?? []
    const counts = statusCounts(monthRequests)
    const submissionCount = monthRequests.reduce((sum, request) => sum + reviewSubmissionCount(request), 0)
    return {
      month,
      requestCount: monthRequests.length,
      submissionCount,
      resubmissionCount: Math.max(0, submissionCount - monthRequests.length),
      pendingCount: counts.pending,
      approvedCount: counts.approved,
      rejectedCount: counts.rejected,
    }
  })
}

export function selectReviewStats(
  data: Pick<AppData, 'profiles' | 'reviewRequests'>,
  filters: ReviewStatsFilters,
  now = new Date(),
): ReviewStatsResult {
  const range = resolveReviewStatsRange(filters, now)
  const identities = requesterIdentityMap(data.profiles, data.reviewRequests)

  // 대기 요청은 6개월보다 오래된 행도 로드될 수 있으므로 통계 선택지와 결과에 동일 경계를 적용한다.
  const availableRequests = data.reviewRequests.filter((request) => {
    const dateKey = requestDateKey(request)
    return dateKey !== null && dateKey >= range.minDate && dateKey <= range.maxDate
  })

  const requesterOptions = [...new Set(availableRequests.map((request) => request.requester_id))]
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

  const counts = statusCounts(filteredRequests)
  const submissionCount = filteredRequests.reduce((sum, request) => sum + reviewSubmissionCount(request), 0)
  const requesterRows = buildRequesterRows(filteredRequests, identities)

  return {
    range,
    requesterOptions,
    filteredRequests,
    kpis: {
      requestCount: filteredRequests.length,
      submissionCount,
      resubmissionCount: Math.max(0, submissionCount - filteredRequests.length),
      pendingCount: counts.pending,
      approvedCount: counts.approved,
      rejectedCount: counts.rejected,
    },
    requesterRows,
    monthlyRows: range.valid ? buildMonthlyRows(filteredRequests, range) : [],
    statusCounts: STATUS_ORDER.reduce<Record<ReviewStatus, number>>(
      (result, status) => {
        result[status] = counts[status]
        return result
      },
      { pending: 0, approved: 0, rejected: 0 },
    ),
  }
}
