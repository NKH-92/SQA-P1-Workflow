import type {
  Announcement,
  AuditEvent,
  ChangeAssigneeOption,
  ChangeProductScopeRow,
  ProductChangeTask,
  ReviewRequest,
} from '../types'
import { supabase } from '../lib/supabase'
import { assembleAppData, emptyAppData } from './fetch/assembleAppData'
import type { AssembledAppData } from './fetch/assembleAppData'
import { fetchAllPages } from './fetch/pagination'
import type { PageResult } from './fetch/pagination'

export { mergeAnnouncements, sortAnnouncements } from './announcementCollection'

export type FetchAppDataResult = AssembledAppData

// Keep the Stage A compatibility-only attachment_url column outside every
// browser response. Stage B removes the column after the operator purge barrier.
export const REVIEW_REQUEST_SELECT = 'id,requester_id,title,description,due_date,status,review_round,rejection_count,last_submitted_at,status_changed_at,closed_at,withdrawn_at,withdrawn_by,withdrawal_reason,created_at,updated_at,profiles(name,email),review_feedback(id,review_request_id,leader_id,author_role,comment,created_at,updated_at,voided_at,voided_by,void_reason,profiles(name))'

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

export function reviewArchiveCutoff(now = new Date()): string {
  const cutoff = new Date(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - 90)
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
    .select(REVIEW_REQUEST_SELECT)
    .eq('id', requestId)
  if (signal) query = query.abortSignal(signal)
  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return (data as ReviewRequest | null) ?? null
}

export async function fetchWithdrawnReviewRequestsPage(page = 0, pageSize = 50): Promise<ReviewRequest[]> {
  if (!supabase) return []
  const from = Math.max(0, page) * pageSize
  const { data, error } = await supabase
    .from('review_requests')
    .select(REVIEW_REQUEST_SELECT)
    .eq('status', 'withdrawn')
    .gte('withdrawn_at', reviewArchiveCutoff())
    .order('withdrawn_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + pageSize - 1)
  if (error) throw error
  return (data ?? []) as unknown as ReviewRequest[]
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

export async function fetchAuditEvents(beforeId: number | null = null, limit = 50): Promise<AuditEvent[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_audit_events', {
    p_limit: Math.max(1, Math.min(limit, 100)),
    p_before_id: beforeId,
  })
  if (error) throw error
  return (data ?? []).map((event: Record<string, unknown>) => ({ ...event, id: Number(event.id) })) as AuditEvent[]
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

export async function fetchAppData(previous?: AssembledAppData): Promise<FetchAppDataResult> {
  if (!supabase) return { ...emptyAppData(), optionalWarnings: [] }
  const client = supabase

  const [
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    reviewEventsResult,
    reviewReadReceiptsResult,
    projectsResult,
    projectAssignmentsResult,
    changeApplicationsResult,
    changeActionItemsResult,
    productChangeTasksResult,
    changeProductScopeResult,
    changeAssigneeOptionsResult,
  ] = await Promise.all([
    fetchAllPages((from, to) => client.from('profiles').select('*').order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('products').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('duty_major_categories').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('duties').select('*, duty_major_categories(name,sort_order)').order('sort_order', { ascending: true, nullsFirst: false }).order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('product_assignments').select('*, profiles(name,email), products(name,category,company_name,sort_order)').order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages((from, to) => client.from('duty_assignments').select('*, profiles(name,email), duties(name,major_category_id,duty_major_categories(name))').order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages<ReviewRequest>((from, to) => client.from('review_requests')
      .select(REVIEW_REQUEST_SELECT)
      .or(`status.eq.pending,and(status.in.(approved,rejected),closed_at.gte.${reviewHistoryCutoff()}))`)
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'review_feedback', ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<ReviewRequest>>),
    fetchAllPages((from, to) => client.from('review_events').select('*').order('id', { ascending: false }).range(from, to)),
    fetchAllPages((from, to) => client.from('review_read_receipts').select('*').range(from, to)),
    fetchAllPages((from, to) => client.from('projects').select('*').order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages((from, to) => client.from('project_assignments').select('*, profiles(name,email), projects(name,description,deadline,status)').order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages((from, to) => client.from('change_applications').select('*').order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages((from, to) => client.from('change_action_items').select('*').order('sort_order', { ascending: true }).range(from, to)),
    fetchAllPages((from, to) => client.from('product_change_tasks').select('*, products(name,category,company_name,sort_order)').or(`status.eq.pending,updated_at.gte.${changeTaskHistoryCutoff()}`).order('updated_at', { ascending: false }).range(from, to)),
    fetchAllPages<ChangeProductScopeRow>((from, to) => client.rpc('list_change_application_product_scope').range(from, to)),
    fetchAllPages<ChangeAssigneeOption>((from, to) => client.rpc('list_change_application_assignees').range(from, to)),
  ])

  const coreResults = [
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    reviewEventsResult,
    reviewReadReceiptsResult,
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
      reviewEventsResult,
      reviewReadReceiptsResult,
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
    previous,
  )
}
