import type { ChangeApplication, ChangeApplicationSummary, ProductChangeTask } from '../../types'

export const FULLY_APPLIED_ARCHIVE_REASON = '모든 제품 적용이 완료되어 자동 보관됨'
export const FULLY_PROCESSED_ARCHIVE_REASON = '모든 제품 적용업무가 처리되어 자동 보관됨'

export type ProductTaskCompletionSummary = {
  total: number
  completed: number
  notApplicable: number
  pending: number
  processed: number
  percent: number
  allApplied: boolean
  allProcessed: boolean
}

/**
 * Cancelled rows remain audit history, but they are not part of the active
 * product scope used to decide whether a change is fully applied.
 */
export function summarizeProductTaskCompletion(
  tasks: readonly Pick<ProductChangeTask, 'status'>[],
): ProductTaskCompletionSummary {
  const active = tasks.filter((task) => task.status !== 'cancelled')
  const completed = active.filter((task) => task.status === 'completed').length
  const notApplicable = active.filter((task) => task.status === 'not_applicable').length
  const pending = active.filter((task) => task.status === 'pending').length
  const processed = completed + notApplicable
  const total = active.length

  return {
    total,
    completed,
    notApplicable,
    pending,
    processed,
    percent: total > 0 ? Math.round((processed / total) * 100) : 0,
    allApplied: total > 0 && completed === total,
    allProcessed: total > 0 && processed === total,
  }
}

/** Persisted server/local signal that stays reliable even when old task rows are capped. */
export function hasFullyAppliedArchiveSignal(
  application: Pick<ChangeApplication, 'archive_origin' | 'archive_reason'>,
) {
  return application.archive_origin === 'automatic'
    && application.archive_reason === FULLY_APPLIED_ARCHIVE_REASON
}

export function buildChangeApplicationSummary(
  application: ChangeApplication,
  tasks: readonly ProductChangeTask[],
): ChangeApplicationSummary {
  const completed = tasks.filter((task) => task.status === 'completed').length
  const notApplicable = tasks.filter((task) => task.status === 'not_applicable').length
  const pending = tasks.filter((task) => task.status === 'pending').length
  const scopeRemoved = tasks.filter(
    (task) => task.status === 'cancelled' && task.cancel_kind === 'scope_removed',
  ).length
  const unresolvedCancelled = tasks.filter(
    (task) => task.status === 'cancelled'
      && task.cancel_kind !== 'scope_removed'
      && task.cancel_kind !== 'application_cancelled',
  ).length
  const workflowTasks = tasks.filter(
    (task) => !(task.status === 'cancelled' && task.cancel_kind === 'application_cancelled'),
  )
  const unassigned = workflowTasks.filter(
    (task) => !(task.status === 'cancelled' && task.cancel_kind === 'scope_removed')
      && !task.assignee_id,
  ).length
  const processed = completed + notApplicable + scopeRemoved
  const total = workflowTasks.length
  const canFinalize = application.status === 'published'
    && !application.final_completed_at
    && !application.archived_at
    && total > 0
    && pending === 0
    && unresolvedCancelled === 0
    && unassigned === 0
    && processed === total

  let workflowStatus: ChangeApplicationSummary['workflow_status']
  if (application.status === 'draft') workflowStatus = 'draft'
  else if (application.status === 'cancelled') workflowStatus = 'cancelled'
  else if (application.final_completed_at) workflowStatus = 'completed'
  else if (application.archived_at) workflowStatus = 'legacy_completed'
  else if (canFinalize) workflowStatus = 'final_review_ready'
  else workflowStatus = 'in_progress'

  return {
    change_application_id: application.id,
    workflow_status: workflowStatus,
    total_count: total,
    pending_count: pending,
    completed_count: completed,
    not_applicable_count: notApplicable,
    scope_removed_count: scopeRemoved,
    unresolved_cancelled_count: unresolvedCancelled,
    unassigned_count: unassigned,
    processed_count: processed,
    percent: total > 0 ? Math.round((processed / total) * 100) : 0,
    can_finalize: canFinalize,
  }
}

export function selectOrBuildChangeApplicationSummary(
  application: ChangeApplication,
  tasks: readonly ProductChangeTask[],
  serverSummaries: readonly ChangeApplicationSummary[] = [],
): ChangeApplicationSummary {
  return serverSummaries.find((summary) => summary.change_application_id === application.id)
    ?? buildChangeApplicationSummary(application, tasks)
}
