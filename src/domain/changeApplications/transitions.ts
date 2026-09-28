import type { ActivityLogInput } from '../activityLog'
import type {
  AppData,
  ChangeApplication,
  ProductChangeTask,
  Profile,
} from '../../types'
import { changeTaskAssigneeHistory } from './assigneeHistory'
export type ChangeTransitionResult = {
  data: AppData
  logFacts: ActivityLogInput[]
}

type TaskTransitionInput = {
  data: AppData
  actor: Profile
  task: ProductChangeTask
  application: ChangeApplication
  now: string
}

function updateApplication(
  data: AppData,
  applicationId: string,
  update: (item: ChangeApplication) => ChangeApplication,
) {
  return data.changeApplications.map((item) => item.id === applicationId ? update(item) : item)
}

function updateTask(
  data: AppData,
  taskId: string,
  update: (item: ProductChangeTask) => ProductChangeTask,
) {
  return data.productChangeTasks.map((item) => item.id === taskId ? update(item) : item)
}

export function resolveProductTaskTransition(
  input: TaskTransitionInput & {
    status: 'completed' | 'not_applicable'
    completionNote: string | null
    resolutionReason: string | null
    proxyReason: string | null
  },
): ChangeTransitionResult {
  const { data, actor, task, application, now } = input
  const dataAfter: AppData = {
    ...data,
    changeApplications: updateApplication(data, application.id, (item) => ({
      ...item,
      content_locked_at: item.content_locked_at ?? now,
      archived_at: item.archived_at ?? null,
      archived_by: item.archived_by ?? null,
      archive_origin: item.archive_origin ?? null,
      archive_reason: item.archive_reason ?? null,
      updated_at: now,
    })),
    productChangeTasks: updateTask(data, task.id, (item) => ({
      ...item,
      assignee_history_ids: changeTaskAssigneeHistory(item, actor.id),
      status: input.status,
      completion_note: input.completionNote,
      resolution_reason: input.resolutionReason,
      proxy_reason: input.proxyReason,
      completed_by: actor.id,
      completed_by_name: actor.name,
      completed_at: now,
      updated_at: now,
    })),
  }
  const action = input.status === 'completed' ? 'completed' : 'not_applicable'
  const logFacts: ActivityLogInput[] = [{
    actor,
    targetUserId: task.assignee_id,
    entityType: 'product_change_task',
    entityId: task.id,
    action,
    summary: input.status === 'completed'
      ? `${actor.name}님이 ${task.product_name} 변경 적용을 완료했어요.`
      : `${actor.name}님이 ${task.product_name} 변경 적용을 해당 없음으로 처리했어요.`,
    metadata: input.status === 'completed'
      ? { completion_note: input.completionNote, proxy_reason: input.proxyReason }
      : { reason: input.resolutionReason, proxy_reason: input.proxyReason },
  }]
  return { data: dataAfter, logFacts }
}

export function reopenProductTaskTransition(
  input: TaskTransitionInput & { reason: string },
): ChangeTransitionResult {
  const { data, actor, task, application, now, reason } = input
  const previous = {
    status: task.status,
    completed_at: task.completed_at,
    completion_note: task.completion_note,
    resolution_reason: task.resolution_reason,
  }
  // 보관·최종 완료한 공통변경은 저장소가 먼저 거부하므로 여기서는 보관 상태를 건드리지 않는다.
  const dataAfter: AppData = {
    ...data,
    changeApplications: updateApplication(data, application.id, (item) => ({
      ...item,
      updated_at: now,
    })),
    productChangeTasks: updateTask(data, task.id, (item) => ({
      ...item,
      assignee_history_ids: changeTaskAssigneeHistory(item),
      status: 'pending',
      completion_note: null,
      resolution_reason: null,
      proxy_reason: null,
      completed_by: null,
      completed_by_name: null,
      completed_at: null,
      reopened_by: actor.id,
      reopened_by_name: actor.name,
      reopened_at: now,
      reopen_reason: reason,
      updated_at: now,
    })),
  }
  const logFacts: ActivityLogInput[] = [{
    actor,
    targetUserId: task.assignee_id,
    entityType: 'product_change_task',
    entityId: task.id,
    action: 'reopened',
    summary: `${actor.name}님이 ${task.product_name} 적용 업무를 다시 열었어요.`,
    metadata: { ...previous, reason },
  }]
  return { data: dataAfter, logFacts }
}

export function reassignProductTasksTransition(input: {
  data: AppData
  actor: Profile
  tasks: ProductChangeTask[]
  assigneeId: string | null
  assigneeName: string | null
  reason: string
  now: string
}): ChangeTransitionResult {
  const taskIds = new Set(input.tasks.map((task) => task.id))
  return {
    data: {
      ...input.data,
      productChangeTasks: input.data.productChangeTasks.map((item) => taskIds.has(item.id) ? {
        ...item,
        assignee_history_ids: changeTaskAssigneeHistory(item, input.assigneeId),
        assignee_id: input.assigneeId,
        assignee_name: input.assigneeName,
        updated_at: input.now,
      } : item),
    },
    logFacts: input.tasks.map((task) => ({
      actor: input.actor,
      targetUserId: input.assigneeId,
      entityType: 'product_change_task' as const,
      entityId: task.id,
      action: 'reassigned',
      summary: `${input.actor.name}님이 ${task.product_name} 적용 업무 담당자를 바꿨어요.`,
      metadata: { from_assignee_id: task.assignee_id, to_assignee_id: input.assigneeId, reason: input.reason },
    })),
  }
}

export function cancelProductTaskTransition(
  input: TaskTransitionInput & { reason: string },
): ChangeTransitionResult {
  return {
    data: {
      ...input.data,
      productChangeTasks: updateTask(input.data, input.task.id, (item) => ({
        ...item,
        status: 'cancelled',
        cancel_kind: 'manual',
        cancelled_at: input.now,
        cancelled_by: input.actor.id,
        resolution_reason: input.reason,
        updated_at: input.now,
      })),
    },
    logFacts: [{
      actor: input.actor,
      targetUserId: input.task.assignee_id,
      entityType: 'product_change_task',
      entityId: input.task.id,
      action: 'cancelled',
      summary: `${input.actor.name}님이 ${input.task.product_name} 적용 업무를 취소했어요.`,
      metadata: { reason: input.reason },
    }],
  }
}

export function restoreProductScopeTransition(
  input: TaskTransitionInput & { reason: string },
): ChangeTransitionResult {
  return {
    data: {
      ...input.data,
      productChangeTasks: updateTask(input.data, input.task.id, (item) => ({
        ...item,
        status: 'pending',
        cancel_kind: null,
        cancelled_at: null,
        cancelled_by: null,
        restored_at: input.now,
        restored_by: input.actor.id,
        restore_reason: input.reason,
        resolution_reason: null,
        updated_at: input.now,
      })),
    },
    logFacts: [{
      actor: input.actor,
      entityType: 'product_change_task',
      entityId: input.task.id,
      action: 'scope_restored',
      summary: `${input.actor.name}님이 ${input.task.product_name} 제품을 적용 범위에 다시 넣었어요.`,
      metadata: { reason: input.reason },
    }],
  }
}

export function cancelChangeApplicationTransition(input: {
  data: AppData
  actor: Profile
  application: ChangeApplication
  actionItemIds: Set<string>
  reason: string
  now: string
}): ChangeTransitionResult {
  return {
    data: {
      ...input.data,
      changeApplications: updateApplication(input.data, input.application.id, (item) => ({
        ...item,
        status: 'cancelled',
        cancelled_at: input.now,
        cancellation_reason: input.reason,
        updated_at: input.now,
      })),
      productChangeTasks: input.data.productChangeTasks.map((item) =>
        input.actionItemIds.has(item.action_item_id) && item.status === 'pending'
          ? {
              ...item,
              status: 'cancelled',
              cancel_kind: 'application_cancelled',
              cancelled_at: input.now,
              cancelled_by: input.actor.id,
              resolution_reason: input.reason,
              updated_at: input.now,
            }
          : item,
      ),
    },
    logFacts: [{
      actor: input.actor,
      entityType: 'change_application',
      entityId: input.application.id,
      action: 'cancelled',
      summary: `${input.actor.name}님이 ${input.application.change_number} 공통변경을 취소했어요.`,
      metadata: { reason: input.reason },
    }],
  }
}
