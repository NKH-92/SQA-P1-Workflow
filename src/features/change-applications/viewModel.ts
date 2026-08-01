import { daysUntil } from '../../lib/dates'
import type {
  AppData,
  ChangeActionKind,
  ChangeApplication,
  ChangeApplicationHistoryResult,
  ChangeApplicationSummary,
  ChangeApplicationWorkflowStatus,
  ProductChangeTask,
  ProductChangeTaskStatus,
} from '../../types'
import type { ProductChangeTaskContext } from './selectors'

export type ChangeApplicationViewMode = 'change' | 'product' | 'assignee'
export type LeaderChangeApplicationTab = 'active' | 'final_review' | 'history'
export type MemberChangeApplicationTab = 'pending' | 'history'
export type ChangeTaskStatusFilter = 'all' | ProductChangeTaskStatus
export type ChangeApplicationStatusFilter = 'all' | 'draft' | 'published' | 'cancelled'
export type ChangeApplicationArchiveFilter = 'active' | 'archived' | 'all'
export type ChangeActionKindFilter = 'all' | ChangeActionKind
export type ChangeAttentionFilter = 'all' | 'overdue' | 'due_soon' | 'unassigned'

export type ChangeApplicationFilters = {
  status: ChangeTaskStatusFilter
  application: ChangeApplicationStatusFilter
  archive: ChangeApplicationArchiveFilter
  actionKind: ChangeActionKindFilter
  attention: ChangeAttentionFilter
  query: string
}

export function changeApplicationWorkflowLabel(status: ChangeApplicationWorkflowStatus) {
  if (status === 'draft') return '초안'
  if (status === 'in_progress') return '진행 중'
  if (status === 'final_review_ready') return '최종 확인 대기'
  if (status === 'completed') return '변경 완료'
  if (status === 'cancelled') return '취소'
  return '기존 완료'
}

export function changeApplicationHistoryResultLabel(result: ChangeApplicationHistoryResult) {
  if (result === 'completed') return '변경 완료'
  if (result === 'cancelled') return '취소'
  if (result === 'legacy_auto') return '기존 자동 완료'
  return '기존 보관'
}

export function filterApplicationsByLeaderTab(
  applications: ChangeApplication[],
  summaries: ReadonlyMap<string, ChangeApplicationSummary>,
  tab: Exclude<LeaderChangeApplicationTab, 'history'>,
) {
  return applications.filter((application) => {
    const workflow = summaries.get(application.id)?.workflow_status
    if (tab === 'final_review') return workflow === 'final_review_ready'
    return workflow === 'draft' || workflow === 'in_progress'
  })
}

export function changeApplicationActionItemKey(data: AppData, applicationId: string) {
  return data.changeActionItems
    .filter((item) => item.change_application_id === applicationId)
    .map((item) => item.id)
    .sort()
    .join('|')
}

export function mergeProductChangeTasks(
  current: ProductChangeTask[],
  incoming: ProductChangeTask[],
  replaceExisting: boolean,
) {
  const byId = new Map(current.map((task) => [task.id, task]))
  for (const task of incoming) {
    if (replaceExisting || !byId.has(task.id)) byId.set(task.id, task)
  }
  return [...byId.values()]
}

export function applicationStatusLabel(status: ChangeApplication['status']) {
  if (status === 'draft') return '초안'
  if (status === 'published') return '배포'
  return '취소'
}

export function applicationCreatorName(data: AppData, application: ChangeApplication) {
  return application.profiles?.name
    ?? data.changeAssigneeOptions.find((item) => item.id === application.created_by)?.name
    ?? data.profiles.find((item) => item.id === application.created_by)?.name
    ?? '등록자'
}

export function filterChangeTaskContexts(
  contexts: ProductChangeTaskContext[],
  filters: ChangeApplicationFilters,
  now = new Date(),
) {
  const normalized = filters.query.trim().toLowerCase()
  return contexts.filter(({ task, actionItem, application }) => {
    if (filters.archive === 'active' && application.archived_at) return false
    if (filters.archive === 'archived' && !application.archived_at) return false
    if (filters.status !== 'all' && task.status !== filters.status) return false
    if (filters.application !== 'all' && application.status !== filters.application) return false
    if (filters.actionKind !== 'all' && actionItem.kind !== filters.actionKind) return false
    if (filters.attention !== 'all') {
      const days = daysUntil(actionItem.due_date, now)
      if (application.status !== 'published') return false
      if (task.status !== 'pending') return false
      if (filters.attention === 'overdue' && (days == null || days >= 0)) return false
      if (filters.attention === 'due_soon' && (days == null || days < 0 || days > 3)) return false
      if (filters.attention === 'unassigned' && task.assignee_id) return false
    }
    if (!normalized) return true
    return `${application.change_number} ${application.title} ${actionItem.content} ${task.product_name} ${task.assignee_name ?? ''}`
      .toLowerCase()
      .includes(normalized)
  })
}

export function filterChangeApplications(
  applications: ChangeApplication[],
  taskContexts: ProductChangeTaskContext[],
  filters: ChangeApplicationFilters,
  leaderMode: boolean,
  profileId: string,
) {
  const normalized = filters.query.trim().toLowerCase()
  return applications.filter((application) => {
    if (!leaderMode && application.status === 'draft' && application.created_by !== profileId) return false
    if (filters.archive === 'active' && application.archived_at) return false
    if (filters.archive === 'archived' && !application.archived_at) return false
    if (filters.application !== 'all' && application.status !== filters.application) return false
    if (normalized && !`${application.change_number} ${application.title} ${application.summary}`.toLowerCase().includes(normalized)) {
      return taskContexts.some(({ application: item }) => item.id === application.id)
    }
    if (filters.status !== 'all' || filters.actionKind !== 'all' || filters.attention !== 'all') {
      return taskContexts.some(({ application: item }) => item.id === application.id)
    }
    return true
  })
}

export function calculateChangeApplicationKpis(
  contexts: ProductChangeTaskContext[],
  leaderMode: boolean,
  profileId: string,
  now = new Date(),
) {
  const publishedOwnContexts = contexts.filter(
    ({ task, application }) =>
      application.status === 'published'
      && !application.archived_at
      && (leaderMode || task.assignee_id === profileId),
  )
  const pendingContexts = publishedOwnContexts.filter(({ task }) => task.status === 'pending')
  const overdueCount = pendingContexts.filter(({ actionItem }) => (daysUntil(actionItem.due_date, now) ?? 0) < 0).length
  const dueSoonCount = pendingContexts.filter(({ actionItem }) => {
    const days = daysUntil(actionItem.due_date, now)
    return days != null && days >= 0 && days <= 3
  }).length
  const unassignedCount = leaderMode
    ? contexts.filter(
        ({ task, application }) =>
          application.status === 'published' && !application.archived_at && task.status === 'pending' && !task.assignee_id,
      ).length
    : 0

  return {
    publishedOwnContexts,
    pendingContexts,
    overdueCount,
    dueSoonCount,
    unassignedCount,
    completedCount: publishedOwnContexts.filter(({ task }) => task.status === 'completed').length,
  }
}

export function groupChangeTaskContexts(
  contexts: ProductChangeTaskContext[],
  viewMode: Exclude<ChangeApplicationViewMode, 'change'>,
) {
  const groups = new Map<string, { title: string; sub: string; items: ProductChangeTaskContext[] }>()
  for (const context of contexts) {
    const key = viewMode === 'product'
      ? context.task.product_id
      : context.task.assignee_id ?? '__unassigned__'
    const title = viewMode === 'product'
      ? context.task.product_name
      : context.task.assignee_name ?? '담당 미지정'
    const sub = viewMode === 'product'
      ? context.task.products?.category ?? '제품'
      : `${context.task.assignee_id ? '적용 책임자' : '파트장 확인 필요'}`
    const group = groups.get(key) ?? { title, sub, items: [] }
    group.items.push(context)
    groups.set(key, group)
  }
  return [...groups.values()].sort((left, right) => left.title.localeCompare(right.title, 'ko'))
}
