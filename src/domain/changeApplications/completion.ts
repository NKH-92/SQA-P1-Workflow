import type { ChangeApplication, ProductChangeTask } from '../../types'

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
