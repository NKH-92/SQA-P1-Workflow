import { useCallback, useMemo } from 'react'
import {
  cancelChangeApplication,
  completeProductChangeTask,
  createRepositoryContext,
  fetchChangeApplicationHistoryPage,
  finalizeChangeApplication,
  markProductChangeTaskNotApplicable,
  removeProductChangeScope,
  reassignProductChangeTasks,
  reopenProductChangeTask,
  restoreProductChangeScope,
  saveChangeApplication,
  undoFinalizeChangeApplication,
} from '../../data'
import type { AppData, Profile } from '../../types'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'
import type { ChangeApplicationInput } from './types'

export function useChangeApplicationController(
  profile: Profile,
  data: AppData,
  setData: AppDataUpdater,
) {
  const context = useMemo(
    () => createRepositoryContext(profile, data, setData),
    [data, profile, setData],
  )
  const fetchHistoryPage = useCallback(
    (filters: Parameters<typeof fetchChangeApplicationHistoryPage>[0], cursor: Parameters<typeof fetchChangeApplicationHistoryPage>[1]) =>
      fetchChangeApplicationHistoryPage(filters, cursor, data, undefined, profile),
    [data, profile],
  )

  return {
    fetchHistoryPage,
    save: (input: ChangeApplicationInput, publish: boolean) =>
      saveChangeApplication(context, input, publish),
    completeTask: (taskId: string, note: string, proxyReason: string) =>
      completeProductChangeTask(context, taskId, note, proxyReason),
    markNotApplicable: (taskId: string, reason: string, proxyReason: string) =>
      markProductChangeTaskNotApplicable(context, taskId, reason, proxyReason),
    reopenTask: (taskId: string, reason: string) => reopenProductChangeTask(context, taskId, reason),
    reassignTasks: (taskIds: string[], assigneeId: string, reason: string) =>
      reassignProductChangeTasks(context, taskIds, assigneeId, reason),
    removeScope: (taskId: string, reason: string) => removeProductChangeScope(context, taskId, reason),
    restoreScope: (taskId: string, reason: string) => restoreProductChangeScope(context, taskId, reason),
    cancelApplication: (applicationId: string, reason: string) =>
      cancelChangeApplication(context, applicationId, reason),
    finalizeApplication: (applicationId: string, expectedUpdatedAt: string, note: string) =>
      finalizeChangeApplication(context, {
        changeApplicationId: applicationId,
        expected_updated_at: expectedUpdatedAt,
        note,
      }),
    undoFinalization: (
      applicationId: string,
      expectedUpdatedAt: string,
      reason: string,
      reopenTasks: Array<{ taskId: string; assigneeId: string }>,
    ) => undoFinalizeChangeApplication(context, {
      changeApplicationId: applicationId,
      expected_updated_at: expectedUpdatedAt,
      reason,
      reopen_tasks: reopenTasks.map((task) => ({ task_id: task.taskId, assignee_id: task.assigneeId })),
    }),
  }
}
