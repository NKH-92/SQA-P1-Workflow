import { supabase } from '../../lib/supabase'
import type { ReviewEvent, ReviewReadReceipt, ReviewRequest } from '../../types'
import { fetchAllPages, type PageResult } from './pagination'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }

export const REVIEW_REQUEST_SELECT = 'id,requester_id,title,description,due_date,status,review_round,rejection_count,last_submitted_at,status_changed_at,closed_at,withdrawn_at,withdrawn_by,withdrawal_reason,created_at,updated_at,profiles!review_requests_requester_id_fkey(name,email),review_feedback(id,review_request_id,leader_id,author_role,comment,created_at,updated_at,voided_at,voided_by,void_reason,profiles!review_feedback_leader_id_fkey(name))'
export const REVIEW_HISTORY_MONTHS = 6

export type ReviewQueryResults = {
  reviewRequestsResult: QueryResult<ReviewRequest[]>
  reviewEventsResult: QueryResult<ReviewEvent[]>
  reviewReadReceiptsResult: QueryResult<ReviewReadReceipt[]>
}

export function reviewHistoryCutoff(now = new Date()): string {
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - REVIEW_HISTORY_MONTHS)
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff.toISOString()
}

export function reviewArchiveCutoff(now = new Date()): string {
  const cutoff = new Date(now)
  cutoff.setUTCDate(cutoff.getUTCDate() - 90)
  return cutoff.toISOString()
}

export async function fetchReviewQueries(client: Client): Promise<ReviewQueryResults> {
  const [reviewRequestsResult, reviewEventsResult, reviewReadReceiptsResult] = await Promise.all([
    fetchAllPages<ReviewRequest>((from, to) => client.from('review_requests')
      .select(REVIEW_REQUEST_SELECT)
      .or(`status.eq.pending,and(status.in.(approved,rejected),closed_at.gte.${reviewHistoryCutoff()}))`)
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'review_feedback', ascending: true })
      .range(from, to) as unknown as PromiseLike<PageResult<ReviewRequest>>),
    fetchAllPages<ReviewEvent>((from, to) => client.from('review_events').select('*').order('id', { ascending: false }).range(from, to) as unknown as PromiseLike<PageResult<ReviewEvent>>),
    fetchAllPages<ReviewReadReceipt>((from, to) => client.from('review_read_receipts').select('*').range(from, to) as unknown as PromiseLike<PageResult<ReviewReadReceipt>>),
  ])
  return { reviewRequestsResult, reviewEventsResult, reviewReadReceiptsResult }
}

export async function fetchReviewRequestById(requestId: string, signal?: AbortSignal): Promise<ReviewRequest | null> {
  if (!supabase) return null
  let query = supabase.from('review_requests').select(REVIEW_REQUEST_SELECT).eq('id', requestId)
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
