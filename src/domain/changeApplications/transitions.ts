import type { ActivityLogInput } from '../activityLog'
import type {
  AppData,
  ChangeApplication,
  ProductChangeTask,
  Profile,
} from '../../types'

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
    autoArchive: boolean
  },
): ChangeTransitionResult {
  const { data, actor, task, application, now } = input
  const dataAfter: AppData = {
    ...data,
    changeApplications: updateApplication(data, application.id, (item) => ({
      ...item,
      content_locked_at: item.content_locked_at ?? now,
      archived_at: input.autoArchive ? now : item.archived_at ?? null,
      archived_by: input.autoArchive ? null : item.archived_by ?? null,
      archive_origin: input.autoArchive ? 'automatic' : item.archive_origin ?? null,
      archive_reason: input.autoArchive ? '모든 제품 적용업무가 처리되어 자동 보관됨' : item.archive_reason ?? null,
      updated_at: now,
    })),
    productChangeTasks: updateTask(data, task.id, (item) => ({
      ...item,
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
      ? `${actor.name}님이 ${task.product_name} 변경 적용을 완료했습니다.`
      : `${actor.name}님이 ${task.product_name} 변경 적용을 해당 없음으로 처리했습니다.`,
    metadata: input.status === 'completed'
      ? { completion_note: input.completionNote, proxy_reason: input.proxyReason }
      : { reason: input.resolutionReason, proxy_reason: input.proxyReason },
  }]
  if (input.autoArchive) {
    logFacts.push({
      actor,
      entityType: 'change_application',
      entityId: application.id,
      action: 'auto_archived',
      summary: `${application.change_number} 변경건의 모든 제품 적용업무가 처리되어 자동 보관되었습니다.`,
      metadata: { task_id: task.id, final_task_status: input.status },
    })
  }
  return { data: dataAfter, logFacts }
}

export function reopenProductTaskTransition(
  input: TaskTransitionInput & { reason: string; wasArchived: boolean },
): ChangeTransitionResult {
  const { data, actor, task, application, now, reason } = input
  const previous = {
    status: task.status,
    completed_at: task.completed_at,
    completion_note: task.completion_note,
    resolution_reason: task.resolution_reason,
  }
  const dataAfter: AppData = {
    ...data,
    changeApplications: updateApplication(data, application.id, (item) => ({
      ...item,
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      updated_at: now,
    })),
    productChangeTasks: updateTask(data, task.id, (item) => ({
      ...item,
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
    summary: `${actor.name}님이 ${task.product_name} 변경 적용업무를 다시 열었습니다.`,
    metadata: { ...previous, reason },
  }]
  if (input.wasArchived) {
    logFacts.push({
      actor,
      entityType: 'change_application',
      entityId: application.id,
      action: 'archive_restored_automatically',
      summary: `${actor.name}님이 제품 업무를 다시 열어 ${application.change_number} 변경건의 보관을 자동 해제했습니다.`,
      metadata: { task_id: task.id, reason },
    })
  }
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
      summary: `${input.actor.name}님이 ${task.product_name} 변경 적용 담당자를 변경했습니다.`,
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
      summary: `${input.actor.name}님이 ${input.task.product_name} 변경 적용업무를 취소했습니다.`,
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
      summary: `${input.actor.name}님이 ${input.task.product_name} 제품을 변경 적용범위에 복원했습니다.`,
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
      summary: `${input.actor.name}님이 ${input.application.change_number} 변경건을 취소했습니다.`,
      metadata: { reason: input.reason },
    }],
  }
}

export function archiveChangeApplicationTransition(input: {
  data: AppData
  actor: Profile
  application: ChangeApplication
  reason: string
  now: string
}): ChangeTransitionResult {
  return {
    data: {
      ...input.data,
      changeApplications: updateApplication(input.data, input.application.id, (item) => ({
        ...item,
        archived_at: input.now,
        archived_by: input.actor.id,
        archive_origin: 'manual',
        archive_reason: input.reason,
        updated_at: input.now,
      })),
    },
    logFacts: [{
      actor: input.actor,
      entityType: 'change_application',
      entityId: input.application.id,
      action: 'archived',
      summary: `${input.actor.name}님이 ${input.application.change_number} 변경건을 보관했습니다.`,
      metadata: { reason: input.reason },
    }],
  }
}

export function restoreChangeApplicationTransition(input: {
  data: AppData
  actor: Profile
  application: ChangeApplication
  reason: string
  now: string
}): ChangeTransitionResult {
  return {
    data: {
      ...input.data,
      changeApplications: updateApplication(input.data, input.application.id, (item) => ({
        ...item,
        archived_at: null,
        archived_by: null,
        archive_origin: null,
        archive_reason: null,
        updated_at: input.now,
      })),
    },
    logFacts: [{
      actor: input.actor,
      entityType: 'change_application',
      entityId: input.application.id,
      action: 'restored',
      summary: `${input.actor.name}님이 ${input.application.change_number} 변경건을 보관함에서 복원했습니다.`,
      metadata: {
        reason: input.reason,
        previous_archive_reason: input.application.archive_reason ?? null,
        previous_archived_at: input.application.archived_at,
      },
    }],
  }
}
