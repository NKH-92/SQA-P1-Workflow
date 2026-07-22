import type { ReviewStatus } from '../../types'

export const REVIEW_STATS_STATUS_OPTIONS: ReviewStatus[] = ['pending', 'approved', 'rejected']

const numberFormatter = new Intl.NumberFormat('ko-KR')

export function formatReviewStatsCount(value: number) {
  return numberFormatter.format(value)
}
