import type { ChangeApplicationInput } from '../contracts'
import {
  normalizeChangeApplicationInput,
  normalizeOptionalTaskNote,
  normalizeTaskReason,
} from '../validation/changeApplications'
import type { RepositoryContext } from '../repositoryContext'

export function saveChangeApplication(
  ctx: RepositoryContext,
  input: ChangeApplicationInput,
  publish: boolean,
) {
  return ctx.repositories.changeApplications.saveChangeApplication(normalizeChangeApplicationInput(ctx.data, input), publish)
}

export function completeProductChangeTask(
  ctx: RepositoryContext,
  taskId: string,
  completionNote: string,
  proxyReason: string,
) {
  return ctx.repositories.changeApplications.completeProductTask(
    taskId,
    normalizeOptionalTaskNote(completionNote, '완료 메모'),
    normalizeOptionalTaskNote(proxyReason, '대리 처리 사유'),
  )
}

export function markProductChangeTaskNotApplicable(
  ctx: RepositoryContext,
  taskId: string,
  reason: string,
  proxyReason: string,
) {
  return ctx.repositories.changeApplications.markProductTaskNotApplicable(
    taskId,
    normalizeTaskReason(reason, '해당 없음 사유'),
    normalizeOptionalTaskNote(proxyReason, '대리 처리 사유'),
  )
}

export function reopenProductChangeTask(ctx: RepositoryContext, taskId: string, reason: string) {
  return ctx.repositories.changeApplications.reopenProductTask(taskId, normalizeTaskReason(reason, '재개 사유'))
}

export function reassignProductChangeTasks(
  ctx: RepositoryContext,
  taskIds: string[],
  assigneeId: string | null,
  reason: string,
) {
  if (taskIds.length === 0) return Promise.resolve()
  return ctx.repositories.changeApplications.reassignProductTasks(
    [...new Set(taskIds)],
    assigneeId || null,
    normalizeTaskReason(reason, '재배정 사유'),
  )
}

export function cancelProductChangeTask(ctx: RepositoryContext, taskId: string, reason: string) {
  return ctx.repositories.changeApplications.cancelProductTask(taskId, normalizeTaskReason(reason, '취소 사유'))
}

export function restoreProductChangeScope(ctx: RepositoryContext, taskId: string, reason: string) {
  return ctx.repositories.changeApplications.restoreProductChangeScope(taskId, normalizeTaskReason(reason, '범위 복원 사유'))
}

export function cancelChangeApplication(ctx: RepositoryContext, changeApplicationId: string, reason: string) {
  return ctx.repositories.changeApplications.cancelChangeApplication(
    changeApplicationId,
    normalizeTaskReason(reason, '취소 사유'),
  )
}

export function archiveChangeApplication(ctx: RepositoryContext, changeApplicationId: string, reason: string) {
  return ctx.repositories.changeApplications.archiveChangeApplication(
    changeApplicationId,
    normalizeTaskReason(reason, '보관 사유'),
  )
}

export function restoreChangeApplication(ctx: RepositoryContext, changeApplicationId: string, reason: string) {
  return ctx.repositories.changeApplications.restoreChangeApplication(
    changeApplicationId,
    normalizeTaskReason(reason, '복원 사유'),
  )
}
