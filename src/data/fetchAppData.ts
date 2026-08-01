import type { ReviewRequest } from '../types'
import { supabase } from '../lib/supabase'
import { assembleAppData, emptyAppData, type AssembledAppData } from './fetch/assembleAppData'
import { fetchChangeQueries } from './fetch/changeQueries'
import { fetchCoreQueries } from './fetch/coreQueries'
import { fetchOptionalQueries } from './fetch/optionalQueries'
import { fetchReviewQueries } from './fetch/reviewQueries'

export { mergeAnnouncements, sortAnnouncements } from './announcementCollection'
export { fetchAuditEvents } from './fetch/auditQueries'
export {
  CHANGE_TASK_HISTORY_MONTHS,
  CHANGE_APPLICATION_HISTORY_PAGE_SIZE,
  changeTaskHistoryCutoff,
  fetchChangeApplicationHistoryPage,
  fetchProductChangeTaskHistory,
} from './fetch/changeQueries'
export { fetchAnnouncementById } from './fetch/optionalQueries'
export {
  REVIEW_HISTORY_MONTHS,
  REVIEW_REQUEST_SELECT,
  fetchReviewHistoryPage,
  fetchReviewEventsPage,
  fetchReviewRequestById,
  fetchReviewStatisticsV2,
  fetchWithdrawnReviewRequestsPage,
  reviewArchiveCutoff,
  reviewHistoryCutoff,
} from './fetch/reviewQueries'

/**
 * The server clock_timestamp() closest to "now" that the assembled
 * data is actually known-good as of. `null` means no bootstrap reported a
 * snapshot (e.g. every required bootstrap failed before this could resolve,
 * or there is no Supabase project at all). See docs/ARCHITECTURE.md
 * "Bootstrap snapshot 계약" for the allowed skew between the three bootstraps.
 */
export type FetchAppDataResult = AssembledAppData & { snapshotAt: string | null }

/** Earliest of the given snapshot timestamps — the most conservative "data known-good as of" claim across independently-snapshotted bootstraps. */
function earliestSnapshot(timestamps: ReadonlyArray<string | null>): string | null {
  const valid = timestamps.filter((value): value is string => typeof value === 'string' && !Number.isNaN(Date.parse(value)))
  if (valid.length === 0) return null
  return valid.reduce((earliest, current) => (Date.parse(current) < Date.parse(earliest) ? current : earliest))
}

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
  if (!supabase) return { ...emptyAppData(), optionalWarnings: [], snapshotAt: null }

  // Three independent single-snapshot bootstraps run in parallel. Each
  // is internally consistent (one statement snapshot server-side);
  // they are not a single cross-domain snapshot, so a mutation that lands
  // between two of them can still be reflected in one bootstrap and not the
  // other for this one refresh. See docs/ARCHITECTURE.md for the documented,
  // bounded skew this implies and why it is an accepted business boundary.
  const [core, review, change] = await Promise.all([
    fetchCoreQueries(supabase),
    fetchReviewQueries(supabase),
    fetchChangeQueries(supabase),
  ])
  const required = { ...core, ...review, ...change }
  // Only scan the actual { data, error } query-result slots — coreSnapshotAt/
  // changeSnapshotAt/reviewSnapshotAt/*Warnings are plain metadata, not
  // QueryResult objects, and must never be mistaken for one.
  const requiredResults = [
    required.profilesResult,
    required.activeLeaderProfilesResult,
    required.productsResult,
    required.dutyMajorCategoriesResult,
    required.dutiesResult,
    required.productAssignmentsResult,
    required.dutyAssignmentsResult,
    required.projectsResult,
    required.projectAssignmentsResult,
    required.reviewRequestsResult,
    required.reviewEventsResult,
    required.reviewReadReceiptsResult,
    required.changeApplicationsResult,
    required.changeActionItemsResult,
    required.productChangeTasksResult,
    required.changeProductScopeResult,
    required.changeAssigneeOptionsResult,
    required.changeApplicationSummariesResult,
  ]
  const failed = requiredResults.find((result) => result.error)
  if (failed?.error) throw failed.error

  const optional = await fetchOptionalQueries(supabase)
  const snapshotAt = earliestSnapshot([core.coreSnapshotAt, review.reviewSnapshotAt, change.changeSnapshotAt])
  const assembled = assembleAppData(required, optional, mergeReviewRequests, previous)
  // Server-detected partial conditions (for example a bounded startup
  // collection exceeding its cap) must surface to the user.
  const bootstrapWarnings = [...core.coreWarnings, ...change.changeWarnings]
  return {
    ...assembled,
    optionalWarnings: [...bootstrapWarnings, ...assembled.optionalWarnings],
    snapshotAt,
  }
}
