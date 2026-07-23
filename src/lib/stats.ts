import type { ReviewRequest } from '../types'
import { businessDateKey, businessDateParts } from './businessTime'

export type ReviewMonthlyStats = {
  month: string
  submitted: number
  approved: number
  rejected: number
  avgProcessingDays: number | null
}

function monthKey(value?: string | null) {
  if (!value) return null
  const time = Date.parse(value)
  if (Number.isNaN(time)) return null
  return businessDateKey(new Date(time)).slice(0, 7)
}

function processingDays(request: ReviewRequest) {
  const start = Date.parse(request.created_at ?? '')
  const end = Date.parse(request.updated_at ?? request.created_at ?? '')
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  return Math.max(0, Math.round((end - start) / 86400000))
}

export function buildReviewMonthlyStats(
  reviewRequests: ReviewRequest[],
  monthsBack = 6,
  now = new Date(),
): ReviewMonthlyStats[] {
  const { year, month } = businessDateParts(now)
  const monthKeys: string[] = []
  for (let offset = monthsBack - 1; offset >= 0; offset -= 1) {
    const date = new Date(Date.UTC(year, month - 1 - offset, 1))
    monthKeys.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`)
  }

  return monthKeys.map((month) => {
    const inMonth = reviewRequests.filter((request) => monthKey(request.created_at) === month)
    const closed = inMonth.filter((request) => request.status === 'approved' || request.status === 'rejected')
    const durations = closed.map(processingDays).filter((value): value is number => value != null)
    const avgProcessingDays =
      durations.length > 0 ? Math.round((durations.reduce((sum, value) => sum + value, 0) / durations.length) * 10) / 10 : null

    return {
      month,
      submitted: inMonth.length,
      approved: inMonth.filter((request) => request.status === 'approved').length,
      rejected: inMonth.filter((request) => request.status === 'rejected').length,
      avgProcessingDays,
    }
  })
}
