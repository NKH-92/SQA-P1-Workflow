import { supabase } from '../../lib/supabase'
import type {
  ChangeActionItem,
  ChangeApplication,
  ChangeApplicationHistoryCursor,
  ChangeApplicationHistoryFilters,
  ChangeApplicationHistoryPage,
  ChangeApplicationHistoryRow,
  ChangeApplicationSummary,
  ChangeAssigneeOption,
  ChangeBootstrapV3Envelope,
  ChangeProductScopeRow,
  ProductChangeTask,
} from '../../types'
import { buildLocalChangeApplicationHistoryPage } from '../../domain/changeApplications/history'
import {
  BootstrapEnvelopeInvalidError,
  checkBootstrapSchemaVersion,
  isStringArray,
  isRecord,
  isValidIsoTimestamp,
  requireArrayFields,
} from './bootstrapEnvelope'
import { fetchAllPages } from './pagination'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }

export const CHANGE_BOOTSTRAP_SCHEMA_VERSION = 3
export const CHANGE_APPLICATION_HISTORY_SCHEMA_VERSION = 1
export const CHANGE_APPLICATION_HISTORY_PAGE_SIZE = 50
export const CHANGE_TASK_HISTORY_MONTHS = 6

export type ChangeQueryResults = {
  changeApplicationsResult: QueryResult<ChangeApplication[]>
  changeActionItemsResult: QueryResult<ChangeActionItem[]>
  productChangeTasksResult: QueryResult<ProductChangeTask[]>
  changeProductScopeResult: QueryResult<ChangeProductScopeRow[]>
  changeAssigneeOptionsResult: QueryResult<ChangeAssigneeOption[]>
  changeApplicationSummariesResult: QueryResult<ChangeApplicationSummary[]>
  /** Server clock_timestamp() when the whole envelope was read; null on error. */
  changeSnapshotAt: string | null
  changeWarnings: string[]
}

/** Kept for the local/UI history-window contract; the bootstrap RPC enforces the same 6-month window server-side. */
export function changeTaskHistoryCutoff(now = new Date()): string {
  const cutoff = new Date(now)
  const day = cutoff.getUTCDate()
  cutoff.setUTCDate(1)
  cutoff.setUTCMonth(cutoff.getUTCMonth() - CHANGE_TASK_HISTORY_MONTHS)
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate()
  cutoff.setUTCDate(Math.min(day, lastDay))
  return cutoff.toISOString()
}

function failedChangeQueryResults(error: unknown): ChangeQueryResults {
  const failed: QueryResult<never> = { data: null, error }
  return {
    changeApplicationsResult: failed,
    changeActionItemsResult: failed,
    productChangeTasksResult: failed,
    changeProductScopeResult: failed,
    changeAssigneeOptionsResult: failed,
    changeApplicationSummariesResult: failed,
    changeSnapshotAt: null,
    changeWarnings: [],
  }
}

/**
 * Replaces five separate queries — including two *unbounded*
 * fetchAllPages() sweeps of list_change_application_product_scope/
 * list_change_application_assignees and an offset-paginated bounded task
 * query — with a single-statement snapshot RPC, so the change
 * registration screen never mixes a product/assignee directory from one DB
 * state with tasks from another.
 */
export async function fetchChangeQueries(client: Client): Promise<ChangeQueryResults> {
  const rpcName = 'get_change_bootstrap_v3'
  const { data, error } = await client.rpc(rpcName)
  if (error) return failedChangeQueryResults(error)

  const envelope = (data ?? null) as ChangeBootstrapV3Envelope | null
  const versionError = checkBootstrapSchemaVersion(rpcName, CHANGE_BOOTSTRAP_SCHEMA_VERSION, envelope)
  if (versionError) return failedChangeQueryResults(versionError)
  if (!envelope) return failedChangeQueryResults(new BootstrapEnvelopeInvalidError(rpcName, 'envelope'))

  if (!isValidIsoTimestamp(envelope.snapshot_at)) {
    return failedChangeQueryResults(new BootstrapEnvelopeInvalidError(rpcName, 'snapshot_at'))
  }
  if (!isStringArray(envelope.warnings)) {
    return failedChangeQueryResults(new BootstrapEnvelopeInvalidError(rpcName, 'warnings'))
  }
  const shapeError = requireArrayFields(rpcName, envelope.data, [
    'change_applications',
    'change_action_items',
    'product_change_tasks',
    'change_product_scope',
    'change_assignee_options',
    'application_summaries',
  ])
  if (shapeError) return failedChangeQueryResults(shapeError)
  if (!envelope.data.application_summaries.every(isValidChangeApplicationSummary)) {
    return failedChangeQueryResults(new BootstrapEnvelopeInvalidError(rpcName, 'data.application_summaries[]'))
  }

  const bootstrapData = envelope.data
  return {
    changeApplicationsResult: { data: bootstrapData.change_applications, error: null },
    changeActionItemsResult: { data: bootstrapData.change_action_items, error: null },
    productChangeTasksResult: { data: bootstrapData.product_change_tasks, error: null },
    changeProductScopeResult: { data: bootstrapData.change_product_scope, error: null },
    changeAssigneeOptionsResult: { data: bootstrapData.change_assignee_options, error: null },
    changeApplicationSummariesResult: { data: bootstrapData.application_summaries, error: null },
    changeSnapshotAt: envelope.snapshot_at,
    changeWarnings: envelope.warnings,
  }
}

const CHANGE_WORKFLOW_STATUSES = new Set([
  'draft', 'in_progress', 'final_review_ready', 'completed', 'cancelled', 'legacy_completed',
])
const CHANGE_HISTORY_RESULTS = new Set(['completed', 'cancelled', 'legacy_auto', 'legacy_manual'])

function isCount(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0
}

export function isValidChangeApplicationSummary(value: unknown): value is ChangeApplicationSummary {
  if (!isRecord(value) || typeof value.change_application_id !== 'string') return false
  if (typeof value.workflow_status !== 'string' || !CHANGE_WORKFLOW_STATUSES.has(value.workflow_status)) return false
  if (![
    'total_count', 'pending_count', 'completed_count', 'not_applicable_count',
    'scope_removed_count', 'unresolved_cancelled_count', 'unassigned_count', 'processed_count',
  ].every((field) => isCount(value[field]))) return false
  return isCount(value.percent) && value.percent <= 100 && typeof value.can_finalize === 'boolean'
}

function isValidHistoryRow(value: unknown): value is ChangeApplicationHistoryRow {
  if (!isRecord(value)) return false
  if (typeof value.id !== 'string' || typeof value.change_number !== 'string' || typeof value.title !== 'string') return false
  if (typeof value.history_result !== 'string' || !CHANGE_HISTORY_RESULTS.has(value.history_result)) return false
  if (!isValidIsoTimestamp(value.history_at) || !isValidChangeApplicationSummary(value.application_summary)) return false
  if (!Array.isArray(value.product_tasks)) return false
  return value.product_tasks.every((task) => isRecord(task)
    && typeof task.id === 'string'
    && typeof task.action_item_id === 'string'
    && typeof task.product_id === 'string'
    && typeof task.product_name === 'string'
    && ['pending', 'completed', 'not_applicable', 'cancelled'].includes(String(task.status)))
}

export function isValidChangeApplicationHistoryPage(value: unknown): value is ChangeApplicationHistoryPage {
  if (!isRecord(value) || value.schema_version !== CHANGE_APPLICATION_HISTORY_SCHEMA_VERSION) return false
  if (!isValidIsoTimestamp(value.snapshot_at) || !Array.isArray(value.rows) || !value.rows.every(isValidHistoryRow)) return false
  if (typeof value.has_more !== 'boolean') return false
  if (value.next_cursor !== null) {
    if (!isRecord(value.next_cursor)
      || !isValidIsoTimestamp(value.next_cursor.history_at)
      || typeof value.next_cursor.id !== 'string') return false
  }
  return true
}

export async function fetchChangeApplicationHistoryPage(
  filters: ChangeApplicationHistoryFilters,
  cursor: ChangeApplicationHistoryCursor | null = null,
  localData?: Parameters<typeof buildLocalChangeApplicationHistoryPage>[0],
  pageSize = CHANGE_APPLICATION_HISTORY_PAGE_SIZE,
): Promise<ChangeApplicationHistoryPage> {
  const limit = Math.max(1, Math.min(pageSize, 100))
  if (!supabase) {
    return buildLocalChangeApplicationHistoryPage(localData, filters, cursor, new Date(), limit)
  }
  const { data, error } = await supabase.rpc('list_change_application_history_v1', {
    p_result: filters.result,
    p_query: filters.query.trim() || null,
    p_from: filters.from,
    p_to: filters.to,
    p_product_id: filters.product_id,
    p_assignee_id: filters.assignee_id,
    p_before_history_at: cursor?.history_at ?? null,
    p_before_id: cursor?.id ?? null,
    p_limit: limit,
  })
  if (error) throw error
  if (!isValidChangeApplicationHistoryPage(data)) {
    throw new Error('list_change_application_history_v1 invalid response')
  }
  return data
}

export async function fetchProductChangeTaskHistory(
  actionItemIds: string[],
  signal?: AbortSignal,
): Promise<ProductChangeTask[]> {
  if (!supabase || actionItemIds.length === 0) return []
  const uniqueActionItemIds = [...new Set(actionItemIds)]
  const { data, error } = await fetchAllPages<ProductChangeTask>((from, to) => {
    let query = supabase!
      .from('product_change_tasks')
      .select('*, products(name,category,company_name,sort_order)')
      .in('action_item_id', uniqueActionItemIds)
      .order('updated_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (signal) query = query.abortSignal(signal)
    return query as unknown as PromiseLike<{ data: ProductChangeTask[] | null; error: unknown }>
  })
  if (error) throw error
  return data ?? []
}
