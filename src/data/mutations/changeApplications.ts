import type { ChangeApplicationInput } from '../contracts'
import {
  normalizeChangeApplicationInput,
  normalizeOptionalTaskNote,
  normalizeTaskReason,
} from '../validation/changeApplications'
import { createLocalChangeApplicationRepository } from '../local/localChangeApplicationRepository'
import { createSupabaseChangeApplicationRepository } from '../remote/supabaseChangeApplicationRepository'
import type { RepositoryContext } from '../repositoryContext'

function repository(ctx: RepositoryContext) {
  return ctx.isRemote
    ? createSupabaseChangeApplicationRepository(ctx)
    : createLocalChangeApplicationRepository(ctx)
}

export function saveChangeApplication(
  ctx: RepositoryContext,
  input: ChangeApplicationInput,
  publish: boolean,
) {
  return repository(ctx).saveChangeApplication(normalizeChangeApplicationInput(ctx.data, input), publish)
}

export function completeProductChangeTask(
  ctx: RepositoryContext,
  taskId: string,
  completionNote: string,
  proxyReason: string,
) {
  return repository(ctx).completeProductTask(
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
  return repository(ctx).markProductTaskNotApplicable(
    taskId,
    normalizeTaskReason(reason, '해당 없음 사유'),
    normalizeOptionalTaskNote(proxyReason, '대리 처리 사유'),
  )
}

export function reopenProductChangeTask(ctx: RepositoryContext, taskId: string, reason: string) {
  return repository(ctx).reopenProductTask(taskId, normalizeTaskReason(reason, '재개 사유'))
}

export function reassignProductChangeTasks(
  ctx: RepositoryContext,
  taskIds: string[],
  assigneeId: string | null,
  reason: string,
) {
  if (taskIds.length === 0) return Promise.resolve()
  return repository(ctx).reassignProductTasks(
    [...new Set(taskIds)],
    assigneeId || null,
    normalizeTaskReason(reason, '재배정 사유'),
  )
}

export function cancelProductChangeTask(ctx: RepositoryContext, taskId: string, reason: string) {
  return repository(ctx).cancelProductTask(taskId, normalizeTaskReason(reason, '취소 사유'))
}

export function restoreProductChangeScope(ctx: RepositoryContext, taskId: string, reason: string) {
  return repository(ctx).restoreProductChangeScope(taskId, normalizeTaskReason(reason, '범위 복원 사유'))
}

export function cancelChangeApplication(ctx: RepositoryContext, changeApplicationId: string, reason: string) {
  return repository(ctx).cancelChangeApplication(
    changeApplicationId,
    normalizeTaskReason(reason, '취소 사유'),
  )
}

export function archiveChangeApplication(ctx: RepositoryContext, changeApplicationId: string, reason: string) {
  return repository(ctx).archiveChangeApplication(
    changeApplicationId,
    normalizeTaskReason(reason, '보관 사유'),
  )
}

export function restoreChangeApplication(ctx: RepositoryContext, changeApplicationId: string, reason: string) {
  return repository(ctx).restoreChangeApplication(
    changeApplicationId,
    normalizeTaskReason(reason, '복원 사유'),
  )
}
