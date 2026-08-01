import type {
  AppData,
  ChangeApplication,
  ChangeApplicationHistoryCursor,
  ChangeApplicationHistoryFilters,
  ChangeApplicationHistoryPage,
  ChangeApplicationHistoryResult,
  Profile,
  ProductChangeTask,
} from '../../types'
import { buildChangeApplicationSummary } from './completion'
import { changeTaskWasAssignedTo } from './assigneeHistory'

export const CHANGE_APPLICATION_HISTORY_SCHEMA_VERSION = 1 as const

function applicationTasks(data: AppData, applicationId: string): ProductChangeTask[] {
  const actionIds = new Set(data.changeActionItems
    .filter((action) => action.change_application_id === applicationId)
    .map((action) => action.id))
  return data.productChangeTasks.filter((task) => actionIds.has(task.action_item_id))
}

export function normalizeChangeApplicationHistoryResult(
  application: ChangeApplication,
): ChangeApplicationHistoryResult | null {
  if (application.final_completed_at) return 'completed'
  if (application.status === 'cancelled') return 'cancelled'
  if (!application.archived_at) return null
  return application.archive_origin === 'automatic' ? 'legacy_auto' : 'legacy_manual'
}

function historyAt(application: ChangeApplication): string | null {
  return application.final_completed_at
    ?? (application.status === 'cancelled' ? application.cancelled_at : null)
    ?? application.archived_at
    ?? null
}

function beforeCursor(at: string, id: string, cursor: ChangeApplicationHistoryCursor | null) {
  if (!cursor) return true
  return at < cursor.history_at || (at === cursor.history_at && id < cursor.id)
}

function localHistoryBoundary(value: string, endExclusive: boolean) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value
  const boundary = new Date(`${value}T00:00:00+09:00`)
  if (endExclusive) boundary.setUTCDate(boundary.getUTCDate() + 1)
  return boundary.toISOString()
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

export function buildLocalChangeApplicationHistoryPage(
  data: AppData | undefined,
  filters: ChangeApplicationHistoryFilters,
  cursor: ChangeApplicationHistoryCursor | null = null,
  now = new Date(),
  pageSize = 50,
  viewer?: Pick<Profile, 'id' | 'role'>,
): ChangeApplicationHistoryPage {
  if (!data) {
    return {
      schema_version: CHANGE_APPLICATION_HISTORY_SCHEMA_VERSION,
      snapshot_at: now.toISOString(),
      rows: [],
      has_more: false,
      next_cursor: null,
    }
  }
  const query = filters.query.trim().toLocaleLowerCase('ko')
  const from = filters.from ? localHistoryBoundary(filters.from, false) : null
  const toExclusive = filters.to ? localHistoryBoundary(filters.to, true) : null
  const hasDateOnlyEnd = Boolean(filters.to && isDateOnly(filters.to))
  const restrictToViewer = viewer?.role === 'member'
  if (restrictToViewer && filters.assignee_id && filters.assignee_id !== viewer.id) {
    return {
      schema_version: CHANGE_APPLICATION_HISTORY_SCHEMA_VERSION,
      snapshot_at: now.toISOString(),
      rows: [],
      has_more: false,
      next_cursor: null,
    }
  }
  const rows = data.changeApplications.flatMap((application) => {
    const result = normalizeChangeApplicationHistoryResult(application)
    const at = historyAt(application)
    if (!result || !at || (filters.result && result !== filters.result)) return []
    if (from && at < from) return []
    if (toExclusive && (hasDateOnlyEnd ? at >= toExclusive : at > toExclusive)) return []
    if (!beforeCursor(at, application.id, cursor)) return []
    const tasks = applicationTasks(data, application.id)
    const accessibleTasks = restrictToViewer
      ? tasks.filter((task) => changeTaskWasAssignedTo(task, viewer.id))
      : tasks
    if (restrictToViewer && accessibleTasks.length === 0) return []
    if (filters.product_id && !accessibleTasks.some((task) => task.product_id === filters.product_id)) return []
    if (filters.assignee_id && !accessibleTasks.some(
      (task) => changeTaskWasAssignedTo(task, filters.assignee_id!),
    )) return []
    if (query) {
      const haystack = [
        application.change_number,
        application.title,
        application.summary,
        ...accessibleTasks.flatMap((task) => [task.product_name, task.assignee_name ?? '']),
      ].join('\n').toLocaleLowerCase('ko')
      if (!haystack.includes(query)) return []
    }
    return [{
      ...application,
      history_result: result,
      history_at: at,
      application_summary: buildChangeApplicationSummary(application, tasks),
      product_tasks: accessibleTasks,
    }]
  }).sort((left, right) => right.history_at.localeCompare(left.history_at) || right.id.localeCompare(left.id))
  const limit = Math.max(1, Math.min(pageSize, 100))
  const pageRows = rows.slice(0, limit)
  const last = pageRows[pageRows.length - 1]
  return {
    schema_version: CHANGE_APPLICATION_HISTORY_SCHEMA_VERSION,
    snapshot_at: now.toISOString(),
    rows: pageRows,
    has_more: rows.length > limit,
    next_cursor: rows.length > limit && last ? { history_at: last.history_at, id: last.id } : null,
  }
}
