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
import { toUserMessage, UserFacingError } from '../../lib/errors'
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
     * 한 제품의 적용 업무를 메모 하나로 모두 완료한다. 서버에는 한 건씩 차례로 보낸다(한 번에 처리하는 RPC가 없다).
     * 중간에 실패하면 앞서 완료한 업무는 서버에 남으므로, 몇 건까지 됐는지와 남은 일을 알린다.
     * 실패한 뒤에는 저장 실행기가 목록을 새로 불러와 완료된 업무가 목록에서 빠진다.
     */
    completeTasks: async (taskIds: string[], note: string) => {
      const ids = [...new Set(taskIds)]
      let done = 0
      for (const taskId of ids) {
        try {
          await completeProductChangeTask(context, taskId, note, '')
        } catch (error) {
          if (done === 0) throw error
          throw new UserFacingError(
            `남은 ${ids.length - done}건을 다시 처리해 주세요. ${ids.length}건 중 ${done}건은 완료했어요. ${toUserMessage(error)}`,
          )
        }
        done += 1
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
