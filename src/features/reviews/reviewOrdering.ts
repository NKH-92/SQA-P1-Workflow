import { dateOnlyTime, eventTime } from '../../lib/dates'
import { formatMonthDay, reviewStatusLabels } from '../../lib/format'
import { compareReviewRequests } from '../../lib/priority'
import type { ReviewEvent, ReviewRequest } from '../../types'

/**
 * 파트장 검토요청 목록의 정렬.
 * - priority(우선순위순): 먼저 처리해야 할 요청부터(기존 기본 순서, `compareReviewRequests`)
 * - recent(최근 요청순): 마지막으로 요청한 시각이 최근인 순서
 * - decided(처리 시점순): 파트장이 승인·반려한 시각이 최근인 순서. 아직 결정하지 않은 요청은 뒤에 둔다.
 * - due(기한순): 기한이 빠른 순서. 기한이 없거나 이미 처리한 요청(기한이 더 의미 없는 요청)은 뒤에 둔다.
 */
export type ReviewSortMode = 'priority' | 'recent' | 'decided' | 'due'

export const REVIEW_SORT_OPTIONS: ReadonlyArray<{ value: ReviewSortMode; label: string }> = [
  { value: 'priority', label: '우선순위순' },
  { value: 'recent', label: '최근 요청순' },
  { value: 'decided', label: '처리 시점순' },
  { value: 'due', label: '기한순' },
]

export const DEFAULT_REVIEW_SORT_MODE: ReviewSortMode = 'priority'

export function isReviewSortMode(value: unknown): value is ReviewSortMode {
  return value === 'priority' || value === 'recent' || value === 'decided' || value === 'due'
}

/** 요청한 시각: 재요청한 요청은 마지막 재요청 시각, 아니면 처음 요청한 시각. 목록의 시간 표기와 같은 기준이다. */
export function reviewRequestedAt(request: ReviewRequest): string | null {
  const round = request.review_round ?? 1
  return (round > 1 ? request.last_submitted_at : null) ?? request.created_at ?? null
}

function isDecided(request: ReviewRequest) {
  return request.status === 'approved' || request.status === 'rejected'
}

/** 요청별로 가장 늦은 승인·반려 기록 시각(ms). 정렬마다 전체 기록을 다시 훑지 않도록 한 번만 만든다. */
export function buildDecisionEventIndex(events: ReadonlyArray<ReviewEvent>): Map<string, number> {
  const index = new Map<string, number>()
  for (const event of events) {
    if (event.event_type !== 'approved' && event.event_type !== 'rejected') continue
    const time = eventTime(event.occurred_at)
    if (time <= 0) continue
    const current = index.get(event.review_request_id)
    if (current == null || time > current) index.set(event.review_request_id, time)
  }
  return index
}

/**
 * 파트장이 승인·반려한 시각(ms). 지금 상태가 승인·반려일 때만 값이 있다.
 * closed_at → status_changed_at → 가장 늦은 승인·반려 기록 순서로 찾는다. 모두 없으면 null.
 * 반려 후 다시 요청된 요청은 지금 대기 중이므로 결정 전으로 본다.
 */
export function reviewDecisionTimeMs(
  request: ReviewRequest,
  decisionEvents: ReadonlyMap<string, number> = new Map(),
): number | null {
  if (!isDecided(request)) return null
  for (const value of [request.closed_at, request.status_changed_at]) {
    const time = eventTime(value)
    if (time > 0) return time
  }
  return decisionEvents.get(request.id) ?? null
}

export function reviewDecisionTime(
  request: ReviewRequest,
  events: ReadonlyArray<ReviewEvent> = [],
): string | null {
  const time = reviewDecisionTimeMs(request, buildDecisionEventIndex(events))
  return time == null ? null : new Date(time).toISOString()
}

/** 결정 표기: ‘9월 26일 승인’ / ‘9월 25일 반려’. 결정 전이거나 시각을 모르면 null. */
export function reviewDecisionLabel(
  request: ReviewRequest,
  decisionEvents: ReadonlyMap<string, number> = new Map(),
): string | null {
  const time = reviewDecisionTimeMs(request, decisionEvents)
  const day = time == null ? null : formatMonthDay(time)
  return day ? `${day} ${reviewStatusLabels[request.status]}` : null
}

/** 목록·배지에 쓰는 상태 이름. 반려 뒤 다시 들어온 대기 요청은 ‘재요청’으로 부른다. */
export function reviewStatusText(request: ReviewRequest): string {
  return request.status === 'pending' && (request.review_round ?? 1) > 1
    ? '재요청'
    : reviewStatusLabels[request.status]
}

function compareByRequestedDesc(left: ReviewRequest, right: ReviewRequest) {
  const difference = eventTime(reviewRequestedAt(right)) - eventTime(reviewRequestedAt(left))
  if (difference !== 0) return difference
  return left.id.localeCompare(right.id)
}

export function sortReviewRequests(
  requests: ReadonlyArray<ReviewRequest>,
  mode: ReviewSortMode,
  events: ReadonlyArray<ReviewEvent> = [],
): ReviewRequest[] {
  if (mode === 'priority') return [...requests].sort((left, right) => compareReviewRequests(left, right))
  if (mode === 'recent') return [...requests].sort(compareByRequestedDesc)

  if (mode === 'decided') {
    const index = buildDecisionEventIndex(events)
    const decisionTimes = new Map(requests.map((request) => [request.id, reviewDecisionTimeMs(request, index)]))
    // 0: 결정 시각을 아는 승인·반려, 1: 결정했지만 시각을 모르는 요청, 2: 아직 결정 전(대기 중·회수)
    const group = (request: ReviewRequest) => {
      if (!isDecided(request)) return 2
      return decisionTimes.get(request.id) == null ? 1 : 0
    }
    return [...requests].sort((left, right) => {
      const groupDifference = group(left) - group(right)
      if (groupDifference !== 0) return groupDifference
      const leftTime = decisionTimes.get(left.id) ?? 0
      const rightTime = decisionTimes.get(right.id) ?? 0
      if (rightTime !== leftTime) return rightTime - leftTime
      return compareByRequestedDesc(left, right)
    })
  }

  // due: 대기 중이면서 기한이 있는 요청 → 대기 중이지만 기한이 없는 요청 → 이미 처리한 요청
  const dueTime = (request: ReviewRequest) => (request.status === 'pending' ? dateOnlyTime(request.due_date) : null)
  const group = (request: ReviewRequest) => {
    if (request.status !== 'pending') return 2
    return dueTime(request) == null ? 1 : 0
  }
  return [...requests].sort((left, right) => {
    const groupDifference = group(left) - group(right)
    if (groupDifference !== 0) return groupDifference
    const leftDue = dueTime(left)
    const rightDue = dueTime(right)
    if (leftDue != null && rightDue != null && leftDue !== rightDue) return leftDue - rightDue
    return compareByRequestedDesc(left, right)
  })
}
