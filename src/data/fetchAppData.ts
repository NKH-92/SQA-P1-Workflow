import type { ReviewRequest } from '../types'
import { supabase } from '../lib/supabase'
import { assembleAppData, emptyAppData, type AssembledAppData } from './fetch/assembleAppData'
import { fetchChangeQueries } from './fetch/changeQueries'
import { fetchCoreQueries, fetchProjectQueries } from './fetch/coreQueries'
import { fetchOptionalQueries } from './fetch/optionalQueries'
import { fetchReviewQueries } from './fetch/reviewQueries'

export { mergeAnnouncements, sortAnnouncements } from './announcementCollection'
export { fetchAuditEvents } from './fetch/auditQueries'
export {
  CHANGE_TASK_HISTORY_MONTHS,
  changeTaskHistoryCutoff,
  fetchProductChangeTaskHistory,
} from './fetch/changeQueries'
export { fetchAnnouncementById } from './fetch/optionalQueries'
export {
  REVIEW_HISTORY_MONTHS,
  REVIEW_REQUEST_SELECT,
  fetchReviewRequestById,
  fetchWithdrawnReviewRequestsPage,
  reviewArchiveCutoff,
  reviewHistoryCutoff,
} from './fetch/reviewQueries'

export type FetchAppDataResult = AssembledAppData

export function mergeReviewRequests(
  pending: ReviewRequest[] | null | undefined,
  recentClosed: ReviewRequest[] | null | undefined,
): ReviewRequest[] {
  const byId = new Map<string, ReviewRequest>()
  for (const request of [...(pending ?? []), ...(recentClosed ?? [])]) {
    const current = byId.get(request.id)
    if (!current) {
      byId.set(request.id, request)
      continue
    }
    const currentFreshness = Date.parse(current.updated_at ?? current.created_at ?? '')
    const nextFreshness = Date.parse(request.updated_at ?? request.created_at ?? '')
    const selected =
      nextFreshness > currentFreshness
      || (nextFreshness === currentFreshness && request.status === 'pending' && current.status !== 'pending')
        ? request
        : current
    const feedbackById = new Map<string, NonNullable<ReviewRequest['review_feedback']>[number]>()
    for (const feedback of [...(current.review_feedback ?? []), ...(request.review_feedback ?? [])]) {
      const previous = feedbackById.get(feedback.id)
      if (!previous || Date.parse(feedback.created_at ?? '') >= Date.parse(previous.created_at ?? '')) {
        feedbackById.set(feedback.id, feedback)
      }
    }
    byId.set(
      request.id,
      feedbackById.size > 0
        ? {
            ...selected,
            review_feedback: [...feedbackById.values()].sort(
              (left, right) => Date.parse(left.created_at ?? '') - Date.parse(right.created_at ?? ''),
            ),
          }
        : selected,
    )
  }
  return [...byId.values()].sort((left, right) =>
    Date.parse(right.created_at ?? '') - Date.parse(left.created_at ?? ''),
  )
}

export async function fetchAppData(previous?: AssembledAppData): Promise<FetchAppDataResult> {
  if (!supabase) return { ...emptyAppData(), optionalWarnings: [] }

  const [core, review, projects, change] = await Promise.all([
    fetchCoreQueries(supabase),
    fetchReviewQueries(supabase),
    fetchProjectQueries(supabase),
    fetchChangeQueries(supabase),
  ])
  const required = { ...core, ...review, ...projects, ...change }
  const failed = Object.values(required).find((result) => result.error)
  if (failed?.error) throw failed.error

  const optional = await fetchOptionalQueries(supabase)
  return assembleAppData(required, optional, mergeReviewRequests, previous)
}
