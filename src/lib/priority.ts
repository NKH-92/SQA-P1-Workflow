import type { ReviewRequest, ReviewStatus } from '../types'
import { ageInDays, daysUntil } from './dates'

const statusWeights: Record<ReviewStatus, number> = {
  pending: 0,
  rejected: 4000,
  approved: 5000,
}

export function reviewPriorityScore(request: ReviewRequest, now = new Date()) {
  const days = daysUntil(request.due_date, now)
  const statusWeight = statusWeights[request.status]
  const dueWeight = days == null ? 1000 + ageInDays(request.created_at, now.getTime()) : days
  return statusWeight + dueWeight
}

function createdAtMs(value: string | null | undefined) {
  const parsed = Date.parse(value ?? '')
  return Number.isNaN(parsed) ? 0 : parsed
}

export function compareReviewRequests(left: ReviewRequest, right: ReviewRequest, memberView = false) {
  if (memberView) {
    return createdAtMs(right.created_at) - createdAtMs(left.created_at)
  }
  return reviewPriorityScore(left) - reviewPriorityScore(right)
}
