import type { ReviewRequest, ReviewStatus } from '../types'
import { ageInDays, daysUntil } from './dates'

const statusWeights: Record<ReviewStatus, number> = {
  pending: 0,
  in_review: 2000,
  rejected: 4000,
  approved: 5000,
}

export function reviewPriorityScore(request: ReviewRequest, now = new Date()) {
  const days = daysUntil(request.due_date, now)
  const statusWeight = statusWeights[request.status]
  const dueWeight = days == null ? 1000 + ageInDays(request.created_at, now.getTime()) : days
  return statusWeight + dueWeight
}

export function compareReviewRequests(left: ReviewRequest, right: ReviewRequest, memberView = false) {
  if (memberView) {
    return Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? '')
  }
  return reviewPriorityScore(left) - reviewPriorityScore(right)
}
