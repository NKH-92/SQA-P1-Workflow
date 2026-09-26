import { useCallback, useMemo } from 'react'
import {
  cancelChangeApplication,
  completeProductChangeTask,
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
import { createSequentialRepositoryContext } from './sequentialContext'
import type { ChangeApplicationInput } from './types'

export function useChangeApplicationController(
  profile: Profile,
  data: AppData,
  setData: AppDataUpdater,
) {
  const context = useMemo(
    () => createSequentialRepositoryContext(profile, data, setData),
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
    /**
     * 한 제품의 적용 업무를 메모 하나로 모두 완료한다. 서버에는 한 건씩 차례로 보낸다.
     * 중간에 실패하면 그때까지 완료한 업무는 그대로 두고 오류를 알린다(목록을 새로 불러오면 남은 업무가 보인다).
     */
    completeTasks: async (taskIds: string[], note: string) => {
      for (const taskId of [...new Set(taskIds)]) {
        await completeProductChangeTask(context, taskId, note, '')
      }
    },
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
