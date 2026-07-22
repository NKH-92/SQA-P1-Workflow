import { supabase } from '../../lib/supabase'
import type {
  ChangeActionItem,
  ChangeApplication,
  ChangeAssigneeOption,
  ChangeBootstrapV2Envelope,
  ChangeProductScopeRow,
  ProductChangeTask,
} from '../../types'
import {
  BootstrapEnvelopeInvalidError,
  checkBootstrapSchemaVersion,
  isStringArray,
  isValidIsoTimestamp,
  requireArrayFields,
} from './bootstrapEnvelope'
import { fetchAllPages } from './pagination'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }

export const CHANGE_BOOTSTRAP_SCHEMA_VERSION = 1
export const CHANGE_TASK_HISTORY_MONTHS = 6

export type ChangeQueryResults = {
  changeApplicationsResult: QueryResult<ChangeApplication[]>
  changeActionItemsResult: QueryResult<ChangeActionItem[]>
  productChangeTasksResult: QueryResult<ProductChangeTask[]>
  changeProductScopeResult: QueryResult<ChangeProductScopeRow[]>
  changeAssigneeOptionsResult: QueryResult<ChangeAssigneeOption[]>
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
  const { data, error } = await client.rpc('get_change_bootstrap_v2')
  if (error) return failedChangeQueryResults(error)

  const envelope = (data ?? null) as ChangeBootstrapV2Envelope | null
  const versionError = checkBootstrapSchemaVersion('get_change_bootstrap_v2', CHANGE_BOOTSTRAP_SCHEMA_VERSION, envelope)
  if (versionError) return failedChangeQueryResults(versionError)
  if (!envelope) return failedChangeQueryResults(new BootstrapEnvelopeInvalidError('get_change_bootstrap_v2', 'envelope'))

  if (!isValidIsoTimestamp(envelope.snapshot_at)) {
    return failedChangeQueryResults(new BootstrapEnvelopeInvalidError('get_change_bootstrap_v2', 'snapshot_at'))
  }
  if (!isStringArray(envelope.warnings)) {
    return failedChangeQueryResults(new BootstrapEnvelopeInvalidError('get_change_bootstrap_v2', 'warnings'))
  }
  const shapeError = requireArrayFields('get_change_bootstrap_v2', envelope.data, [
    'change_applications',
    'change_action_items',
    'product_change_tasks',
    'change_product_scope',
    'change_assignee_options',
  ])
  if (shapeError) return failedChangeQueryResults(shapeError)

  const bootstrapData = envelope.data
  return {
    changeApplicationsResult: { data: bootstrapData.change_applications, error: null },
    changeActionItemsResult: { data: bootstrapData.change_action_items, error: null },
    productChangeTasksResult: { data: bootstrapData.product_change_tasks, error: null },
    changeProductScopeResult: { data: bootstrapData.change_product_scope, error: null },
    changeAssigneeOptionsResult: { data: bootstrapData.change_assignee_options, error: null },
    changeSnapshotAt: envelope.snapshot_at,
    changeWarnings: envelope.warnings,
  }
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
