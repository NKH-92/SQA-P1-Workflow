import type { ProductChangeTask } from '../../types'

export function changeTaskAssigneeHistory(
  task: ProductChangeTask,
  ...additionalAssigneeIds: Array<string | null | undefined>
) {
  return [...new Set([
    ...(task.assignee_history_ids ?? []),
    task.assignee_id,
    task.completed_by,
    ...additionalAssigneeIds,
  ].filter((id): id is string => Boolean(id)))]
}

export function changeTaskWasAssignedTo(task: ProductChangeTask, assigneeId: string) {
  return changeTaskAssigneeHistory(task).includes(assigneeId)
}
