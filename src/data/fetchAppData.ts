import type {
  Announcement,
  ProductChangeTask,
  ReviewRequest,
} from '../types'
import { supabase } from '../lib/supabase'
import { assembleAppData, emptyAppData } from './fetch/assembleAppData'
import type { AssembledAppData } from './fetch/assembleAppData'

export { mergeAnnouncements, sortAnnouncements } from './announcementCollection'

export type FetchAppDataResult = AssembledAppData

// Pending requests remain visible regardless of age so members can always
// finish work in progress. Closed requests are intentionally bounded to the
// same six-month window used by the leader dashboard statistics. This keeps
// the recurring refresh payload from growing without silently dropping work
// that is still actionable.
export const REVIEW_HISTORY_MONTHS = 6
export const CHANGE_TASK_HISTORY_MONTHS = 6

export function reviewHistoryCutoff(now = new Date()): string {
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - REVIEW_HISTORY_MONTHS)
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff.toISOString()
}

export function changeTaskHistoryCutoff(now = new Date()): string {
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - CHANGE_TASK_HISTORY_MONTHS)
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff.toISOString()
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
      nextFreshness > currentFreshness ||
      (nextFreshness === currentFreshness && request.status === 'pending' && current.status !== 'pending')
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

/**
 * Fetch a single review on demand for an old/shared deep link. The list query is
 * intentionally capped for closed history, but a user who already has a link
 * must not see it treated as a deleted record solely because it is old.
 */
export async function fetchReviewRequestById(requestId: string, signal?: AbortSignal): Promise<ReviewRequest | null> {
  if (!supabase) return null
  let query = supabase
    .from('review_requests')
    .select('*, profiles(name,email), review_feedback(*, profiles(name))')
    .eq('id', requestId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return (data as ReviewRequest | null) ?? null
}

export async function fetchAnnouncementById(
  announcementId: string,
  signal?: AbortSignal,
): Promise<Announcement | null> {
  if (!supabase) return null
  let query = supabase
    .from('announcements')
    .select('*')
    .eq('id', announcementId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return (data as Announcement | null) ?? null
}

/**
 * Closed change tasks are bounded in the recurring app refresh. A user can
 * explicitly request the complete history for one change without making every
 * normal refresh grow forever.
 */
export async function fetchProductChangeTaskHistory(
  actionItemIds: string[],
  signal?: AbortSignal,
): Promise<ProductChangeTask[]> {
  if (!supabase || actionItemIds.length === 0) return []
  let query = supabase
    .from('product_change_tasks')
    .select('*, products(name,category,company_name,sort_order)')
    .in('action_item_id', [...new Set(actionItemIds)])
    .order('updated_at', { ascending: false })
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as ProductChangeTask[]
}

export async function fetchAppData(): Promise<FetchAppDataResult> {
  if (!supabase) return { ...emptyAppData(), optionalWarnings: [] }

  const [
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    projectsResult,
    projectAssignmentsResult,
    changeApplicationsResult,
    changeActionItemsResult,
    productChangeTasksResult,
    changeProductScopeResult,
    changeAssigneeOptionsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('products').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name'),
    supabase
      .from('duty_major_categories')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabase
      .from('duties')
      .select('*, duty_major_categories(name,sort_order)')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabase
      .from('product_assignments')
      .select('*, profiles(name,email), products(name,category,company_name,sort_order)')
      .order('created_at', { ascending: false }),
    supabase
      .from('duty_assignments')
      .select('*, profiles(name,email), duties(name,major_category_id,duty_major_categories(name))')
      .order('created_at', { ascending: false }),
    supabase
      .from('review_requests')
      .select('*, profiles(name,email), review_feedback(*, profiles(name))')
      // One PostgREST statement gives pending + recent closed rows one consistent
      // snapshot, avoiding a status-transition gap between two independent queries.
      .or(`status.eq.pending,and(status.in.(approved,rejected),created_at.gte.${reviewHistoryCutoff()})`)
      .order('created_at', { ascending: false })
      // Embedded feedback rows must be chronological — the UI highlights the last item as
      // the newest, which only holds if PostgREST returns them oldest-first.
      .order('created_at', { referencedTable: 'review_feedback', ascending: true }),
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase
      .from('project_assignments')
      .select('*, profiles(name,email), projects(name,description,deadline,status)')
      .order('created_at', { ascending: false }),
    supabase.from('change_applications').select('*').order('created_at', { ascending: false }),
    supabase.from('change_action_items').select('*').order('sort_order', { ascending: true }),
    supabase
      .from('product_change_tasks')
      .select('*, products(name,category,company_name,sort_order)')
      .or(`status.eq.pending,updated_at.gte.${changeTaskHistoryCutoff()}`)
      .order('updated_at', { ascending: false }),
    supabase.rpc('list_change_application_product_scope'),
    supabase.rpc('list_change_application_assignees'),
  ])

  const coreResults = [
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    projectsResult,
    projectAssignmentsResult,
    changeApplicationsResult,
    changeActionItemsResult,
    productChangeTasksResult,
    changeProductScopeResult,
    changeAssigneeOptionsResult,
  ]
  const failedCore = coreResults.find((result) => result.error)
  if (failedCore?.error) throw failedCore.error

  const optionalResults = await Promise.allSettled([
    supabase.from('allowed_users').select('*').order('created_at', { ascending: false }),
    supabase.from('profile_notes').select('*').order('created_at', { ascending: false }),
    supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('public_leader_profiles').select('id,name'),
    supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(200),
  ])

  return assembleAppData(
    {
      profilesResult,
      productsResult,
      dutyMajorCategoriesResult,
      dutiesResult,
      productAssignmentsResult,
      dutyAssignmentsResult,
      reviewRequestsResult,
      projectsResult,
      projectAssignmentsResult,
      changeApplicationsResult,
      changeActionItemsResult,
      productChangeTasksResult,
      changeProductScopeResult,
      changeAssigneeOptionsResult,
    },
    optionalResults,
    mergeReviewRequests,
  )
}
