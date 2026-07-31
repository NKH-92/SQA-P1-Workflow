import { supabase } from '../../lib/supabase'
import { buildLocalReviewHistoryPage, REVIEW_HISTORY_PAGE_SIZE } from '../../lib/reviewHistory'
import type {
  ReviewEvent,
  ReviewHistoryCursor,
  ReviewHistoryFilters,
  ReviewHistoryPage,
  ReviewReadReceipt,
  ReviewRequest,
  ReviewStatisticsV2Envelope,
  ReviewStatisticsV2Params,
} from '../../types'
import {
  BootstrapEnvelopeInvalidError,
  checkBootstrapSchemaVersion,
  isRecord,
  isValidIsoTimestamp,
} from './bootstrapEnvelope'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }

export const REVIEW_REQUEST_SELECT = 'id,requester_id,title,description,due_date,status,review_round,rejection_count,last_submitted_at,status_changed_at,closed_at,withdrawn_at,withdrawn_by,withdrawal_reason,created_at,updated_at,profiles!review_requests_requester_id_fkey(name,email),review_feedback(id,review_request_id,leader_id,author_role,comment,created_at,updated_at,voided_at,voided_by,void_reason,profiles!review_feedback_leader_id_fkey(name))'
export const REVIEW_HISTORY_MONTHS = 6
export const REVIEW_BOOTSTRAP_SCHEMA_VERSION = 2
export const REVIEW_HISTORY_SCHEMA_VERSION = 1

export type ReviewQueryResults = {
  reviewRequestsResult: QueryResult<ReviewRequest[]>
  reviewEventsResult: QueryResult<ReviewEvent[]>
  reviewReadReceiptsResult: QueryResult<ReviewReadReceipt[]>
  /** Server clock_timestamp() when the whole envelope was read; null on error. */
  reviewSnapshotAt: string | null
}

/** Kept for the local/UI history-window contract; the bootstrap RPC enforces the same 6-month window server-side. */
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

type ReviewBootstrapV2Envelope = {
  schema_version: number
  snapshot_at: string
  requests: ReviewRequest[]
  events: ReviewEvent[]
  read_receipts: ReviewReadReceipt[]
  unread_count: number
}

function failedReviewQueryResults(error: unknown): ReviewQueryResults {
  return {
    reviewRequestsResult: { data: null, error },
    reviewEventsResult: { data: null, error },
    reviewReadReceiptsResult: { data: null, error },
    reviewSnapshotAt: null,
  }
}

/**
 * Replaces three legacy queries (a bounded review_requests fetch plus
 * two *unbounded* fetchAllPages() sweeps of the entire review_events and
 * review_read_receipts tables) with a single snapshot RPC. The RPC already
 * scopes requests to pending + recent closed, events to the latest
 * role-relevant one per request, and receipts to the caller, so this keeps
 * the exact same ReviewQueryResults shape every existing caller expects.
 *
 * Also surfaces the envelope's snapshot_at (used as evidence for
 * lastSyncedAt alongside the core/change bootstraps) and fails closed on a
 * schema_version mismatch instead of silently reading a shape it does not
 * understand.
 */
export async function fetchReviewQueries(client: Client): Promise<ReviewQueryResults> {
  const { data, error } = await client.rpc('get_review_bootstrap_v2')
  if (error) return failedReviewQueryResults(error)

  const envelope = (data ?? null) as ReviewBootstrapV2Envelope | null
  const versionError = checkBootstrapSchemaVersion('get_review_bootstrap_v2', REVIEW_BOOTSTRAP_SCHEMA_VERSION, envelope)
  if (versionError) return failedReviewQueryResults(versionError)
  if (!envelope) return failedReviewQueryResults(new BootstrapEnvelopeInvalidError('get_review_bootstrap_v2', 'envelope'))

  if (!isValidIsoTimestamp(envelope.snapshot_at)) {
    return failedReviewQueryResults(new BootstrapEnvelopeInvalidError('get_review_bootstrap_v2', 'snapshot_at'))
  }
  for (const field of ['requests', 'events', 'read_receipts'] as const) {
    if (!Array.isArray(envelope[field])) {
      return failedReviewQueryResults(new BootstrapEnvelopeInvalidError('get_review_bootstrap_v2', field))
    }
  }
  if (!Number.isInteger(envelope.unread_count) || envelope.unread_count < 0) {
    return failedReviewQueryResults(new BootstrapEnvelopeInvalidError('get_review_bootstrap_v2', 'unread_count'))
  }

  return {
    reviewRequestsResult: { data: envelope.requests, error: null },
    reviewEventsResult: { data: envelope.events.map((event) => ({
      ...event,
      id: String(event.id),
      ...(event.transaction_id == null ? {} : { transaction_id: String(event.transaction_id) }),
    })), error: null },
    reviewReadReceiptsResult: { data: envelope.read_receipts.map((receipt) => receipt.last_seen_event_id == null ? receipt : ({
      ...receipt,
      last_seen_event_id: String(receipt.last_seen_event_id),
    })), error: null },
    reviewSnapshotAt: envelope.snapshot_at,
  }
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

export async function fetchReviewHistoryPage(
  filters: ReviewHistoryFilters,
  cursor: ReviewHistoryCursor | null = null,
  localRequests: ReviewRequest[] = [],
  pageSize = REVIEW_HISTORY_PAGE_SIZE,
): Promise<ReviewHistoryPage> {
  if (!supabase) return buildLocalReviewHistoryPage(localRequests, filters, cursor, new Date(), pageSize)
  const { data, error } = await supabase.rpc('list_review_history_v1', {
    p_status: filters.status,
    p_query: filters.query.trim() || null,
    p_from: filters.from,
    p_to: filters.to,
    p_before_terminal_at: cursor?.terminal_at ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: Math.max(1, Math.min(pageSize, 100)),
  })
  if (error) throw error
  if (!isValidReviewHistoryPage(data)) throw new Error('list_review_history_v1 invalid response')
  return data
}

function isValidReviewHistoryPage(value: unknown): value is ReviewHistoryPage {
  if (!isRecord(value) || value.schema_version !== REVIEW_HISTORY_SCHEMA_VERSION) return false
  if (!isValidIsoTimestamp(value.snapshot_at) || !Array.isArray(value.rows)) return false
  if (typeof value.has_more !== 'boolean') return false
  if (value.next_cursor !== null) {
    if (!isRecord(value.next_cursor)
      || !isValidIsoTimestamp(value.next_cursor.terminal_at)
      || typeof value.next_cursor.id !== 'string') return false
  }
  return value.rows.every((row) => isRecord(row)
    && typeof row.id === 'string'
    && typeof row.title === 'string'
    && typeof row.description === 'string'
    && ['approved', 'rejected', 'withdrawn'].includes(String(row.status))
    && isValidIsoTimestamp(row.terminal_at))
}

/**
 * On-demand cursor page of the full event history for one review,
 * mirroring fetchAuditEvents()/list_audit_events: `ORDER BY id DESC`, no
 * OFFSET, limit clamped server-side to 1-100. Used to populate a detail-view
 * "load more history" affordance instead of preloading every event up front.
 */
export async function fetchReviewEventsPage(
  reviewRequestId: string,
  beforeId: string | number | null = null,
  limit = 50,
): Promise<ReviewEvent[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('list_review_events_page_v2', {
    p_review_request_id: reviewRequestId,
    p_before_id: beforeId == null ? null : String(beforeId),
    p_limit: Math.max(1, Math.min(limit, 100)),
  })
  if (error) throw error
  if (!Array.isArray(data)) throw new Error('list_review_events_page_v2 invalid response')
  return data.map((event: Record<string, unknown>) => ({
    ...event,
    id: String(event.id),
    ...(event.transaction_id == null ? {} : { transaction_id: String(event.transaction_id) }),
  })) as ReviewEvent[]
}

/**
 * Leader-only server-aggregated statistics. The RPC never returns raw
 * event rows; see buildReviewStatisticsV2() in reviewStatisticsV2.ts for the
 * byte-for-byte local-preview counterpart used when there is no Supabase project.
 */
export async function fetchReviewStatisticsV2(params: ReviewStatisticsV2Params): Promise<ReviewStatisticsV2Envelope> {
  if (!supabase) throw new Error('review statistics require a Supabase connection')
  const { data, error } = await supabase.rpc('get_review_statistics_v2', {
    p_from: params.from,
    p_to: params.to,
    p_requester_id: params.requesterId ?? null,
    p_status: params.status ?? null,
  })
  if (error) throw error
  if (!isValidStatisticsEnvelope(data)) {
    throw new Error('get_review_statistics_v2 invalid aggregate envelope')
  }
  return data
}

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const MONTH_KEY_PATTERN = /^\d{4}-\d{2}$/
const REVIEW_STATUSES = new Set(['pending', 'approved', 'rejected', 'withdrawn'])

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function isStatisticsRequesterRow(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.requester_id === 'string'
    && typeof value.requester_name === 'string'
    && typeof value.requester_inactive === 'boolean'
    && ['new_requests', 'resubmissions', 'approvals', 'rejections', 'pending_count']
      .every((field) => isCount(value[field]))
}

function isStatisticsBacklogRow(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.month === 'string'
    && MONTH_KEY_PATTERN.test(value.month)
    && typeof value.business_date === 'string'
    && DATE_KEY_PATTERN.test(value.business_date)
    && isCount(value.backlog_count)
}

function isStatisticsMonthlyRow(value: unknown): boolean {
  if (!isRecord(value)) return false
  return typeof value.month === 'string'
    && MONTH_KEY_PATTERN.test(value.month)
    && ['new_requests', 'resubmissions', 'approvals', 'rejections', 'month_end_backlog']
      .every((field) => isCount(value[field]))
}

function isValidStatisticsEnvelope(value: unknown): value is ReviewStatisticsV2Envelope {
  if (!isRecord(value)) return false
  if (value.schema_version !== 2 || value.timezone !== 'Asia/Seoul') return false
  if (!isValidIsoTimestamp(value.generated_at)) return false
  if (typeof value.from !== 'string' || !DATE_KEY_PATTERN.test(value.from)) return false
  if (typeof value.to !== 'string' || !DATE_KEY_PATTERN.test(value.to)) return false
  if (!isNullableString(value.requester_id)) return false
  if (!(value.status === null || (typeof value.status === 'string' && REVIEW_STATUSES.has(value.status)))) return false
  if (!['new_requests', 'resubmissions', 'approvals', 'rejections', 'pending_count']
    .every((field) => isCount(value[field]))) return false
  return Array.isArray(value.requester_breakdown)
    && value.requester_breakdown.every(isStatisticsRequesterRow)
    && Array.isArray(value.month_end_backlog)
    && value.month_end_backlog.every(isStatisticsBacklogRow)
    && Array.isArray(value.monthly_breakdown)
    && value.monthly_breakdown.every(isStatisticsMonthlyRow)
}
