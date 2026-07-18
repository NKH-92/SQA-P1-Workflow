import { supabase } from '../../lib/supabase'
import type {
  ChangeActionItem,
  ChangeApplication,
  ChangeAssigneeOption,
  ChangeProductScopeRow,
  ProductChangeTask,
} from '../../types'
import { fetchAllPages, type PageResult } from './pagination'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }

export const CHANGE_TASK_HISTORY_MONTHS = 6

export type ChangeQueryResults = {
  changeApplicationsResult: QueryResult<ChangeApplication[]>
  changeActionItemsResult: QueryResult<ChangeActionItem[]>
  productChangeTasksResult: QueryResult<ProductChangeTask[]>
  changeProductScopeResult: QueryResult<ChangeProductScopeRow[]>
  changeAssigneeOptionsResult: QueryResult<ChangeAssigneeOption[]>
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

export async function fetchChangeQueries(client: Client): Promise<ChangeQueryResults> {
  const [
    changeApplicationsResult,
    changeActionItemsResult,
    productChangeTasksResult,
    changeProductScopeResult,
    changeAssigneeOptionsResult,
  ] = await Promise.all([
    fetchAllPages<ChangeApplication>((from, to) => client.from('change_applications').select('*').order('created_at', { ascending: false }).range(from, to) as unknown as PromiseLike<PageResult<ChangeApplication>>),
    fetchAllPages<ChangeActionItem>((from, to) => client.from('change_action_items').select('*').order('sort_order', { ascending: true }).range(from, to) as unknown as PromiseLike<PageResult<ChangeActionItem>>),
    fetchAllPages<ProductChangeTask>((from, to) => client.from('product_change_tasks').select('*, products(name,category,company_name,sort_order)').or(`status.eq.pending,updated_at.gte.${changeTaskHistoryCutoff()}`).order('updated_at', { ascending: false }).range(from, to) as unknown as PromiseLike<PageResult<ProductChangeTask>>),
    fetchAllPages<ChangeProductScopeRow>((from, to) => client.rpc('list_change_application_product_scope').range(from, to)),
    fetchAllPages<ChangeAssigneeOption>((from, to) => client.rpc('list_change_application_assignees').range(from, to)),
  ])
  return {
    changeApplicationsResult,
    changeActionItemsResult,
    productChangeTasksResult,
    changeProductScopeResult,
    changeAssigneeOptionsResult,
  }
}

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
