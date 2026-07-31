import type {
  ReviewHistoryCursor,
  ReviewHistoryFilters,
  ReviewHistoryPage,
  ReviewHistoryRow,
  ReviewRequest,
} from '../types'
import { businessDateKey, businessDateParts } from './businessTime'

export const LEADER_REVIEW_RECENT_DAYS = 7
export const REVIEW_RETENTION_DAYS = 365
export const REVIEW_HISTORY_PAGE_SIZE = 50

const DAY_MS = 24 * 60 * 60 * 1000

export function reviewTerminalAt(request: ReviewRequest): string | null {
  if (request.status === 'withdrawn') return request.withdrawn_at ?? request.closed_at ?? null
  if (request.status === 'approved' || request.status === 'rejected') return request.closed_at ?? null
  return null
}

function businessDateDaysAgoKey(now: Date, daysAgo: number): string {
  const { year, month, day } = businessDateParts(now)
  const date = new Date(Date.UTC(year, month - 1, day - daysAgo))
  return date.toISOString().slice(0, 10)
}

export function isLeaderDefaultReviewRequest(request: ReviewRequest, now = new Date()): boolean {
  if (request.status === 'pending') return true
  const terminalAt = reviewTerminalAt(request)
  if (!terminalAt) return false
  const terminalDate = new Date(terminalAt)
  if (Number.isNaN(terminalDate.getTime())) return false
  return businessDateKey(terminalDate) >= businessDateDaysAgoKey(now, LEADER_REVIEW_RECENT_DAYS - 1)
}

export function matchesReviewSearch(request: ReviewRequest, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase('ko-KR')
  if (!normalized) return true
  return [request.title, request.description, request.profiles?.name ?? '']
    .some((value) => value.toLocaleLowerCase('ko-KR').includes(normalized))
}

export function asReviewHistoryRow(request: ReviewRequest): ReviewHistoryRow | null {
  const terminalAt = reviewTerminalAt(request)
  if (!terminalAt || request.status === 'pending') return null
  return { ...request, status: request.status, terminal_at: terminalAt }
}

function compareHistoryRows(left: ReviewHistoryRow, right: ReviewHistoryRow): number {
  const timeDifference = new Date(right.terminal_at).getTime() - new Date(left.terminal_at).getTime()
  if (timeDifference !== 0) return timeDifference
  return right.id.localeCompare(left.id)
}

function isBeforeCursor(row: ReviewHistoryRow, cursor: ReviewHistoryCursor): boolean {
  const rowTime = new Date(row.terminal_at).getTime()
  const cursorTime = new Date(cursor.terminal_at).getTime()
  if (rowTime !== cursorTime) return rowTime < cursorTime
  return row.id.localeCompare(cursor.id) < 0
}

export function buildLocalReviewHistoryPage(
  requests: ReviewRequest[],
  filters: ReviewHistoryFilters,
  cursor: ReviewHistoryCursor | null = null,
  now = new Date(),
  pageSize = REVIEW_HISTORY_PAGE_SIZE,
): ReviewHistoryPage {
  const recentCutoff = businessDateDaysAgoKey(now, LEADER_REVIEW_RECENT_DAYS - 1)
  const retentionCutoff = now.getTime() - REVIEW_RETENTION_DAYS * DAY_MS
  const limit = Math.max(1, Math.min(pageSize, 100))
  const candidates = requests
    .map(asReviewHistoryRow)
    .filter((row): row is ReviewHistoryRow => row !== null)
    .filter((row) => {
      const terminalDate = new Date(row.terminal_at)
      if (Number.isNaN(terminalDate.getTime())) return false
      const dateKey = businessDateKey(terminalDate)
      return dateKey < recentCutoff
        && terminalDate.getTime() >= retentionCutoff
        && (filters.status === null || row.status === filters.status)
        && matchesReviewSearch(row, filters.query)
        && (filters.from === null || dateKey >= filters.from)
        && (filters.to === null || dateKey <= filters.to)
        && (cursor === null || isBeforeCursor(row, cursor))
    })
    .sort(compareHistoryRows)
  const rows = candidates.slice(0, limit)
  const hasMore = candidates.length > limit
  const last = rows.length > 0 ? rows[rows.length - 1] : undefined
  return {
    schema_version: 1,
    snapshot_at: now.toISOString(),
    rows,
    has_more: hasMore,
    next_cursor: hasMore && last ? { terminal_at: last.terminal_at, id: last.id } : null,
  }
}
