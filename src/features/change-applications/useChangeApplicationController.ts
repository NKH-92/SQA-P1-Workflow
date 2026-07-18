import { useMemo } from 'react'
import {
  archiveChangeApplication,
  cancelChangeApplication,
  cancelProductChangeTask,
  completeProductChangeTask,
  createRepositoryContext,
  fetchProductChangeTaskHistory,
  markProductChangeTaskNotApplicable,
  reassignProductChangeTasks,
  reopenProductChangeTask,
  restoreChangeApplication,
  restoreProductChangeScope,
  saveChangeApplication,
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

  return {
    historyIsCapped: context.capabilities.historyIsCapped,
    fetchHistory: fetchProductChangeTaskHistory,
    save: (input: ChangeApplicationInput, publish: boolean) =>
      saveChangeApplication(context, input, publish),
    completeTask: (taskId: string, note: string, proxyReason: string) =>
      completeProductChangeTask(context, taskId, note, proxyReason),
    markNotApplicable: (taskId: string, reason: string, proxyReason: string) =>
      markProductChangeTaskNotApplicable(context, taskId, reason, proxyReason),
    reopenTask: (taskId: string, reason: string) => reopenProductChangeTask(context, taskId, reason),
    reassignTasks: (taskIds: string[], assigneeId: string | null, reason: string) =>
      reassignProductChangeTasks(context, taskIds, assigneeId, reason),
    cancelTask: (taskId: string, reason: string) => cancelProductChangeTask(context, taskId, reason),
    restoreScope: (taskId: string, reason: string) => restoreProductChangeScope(context, taskId, reason),
    cancelApplication: (applicationId: string, reason: string) =>
      cancelChangeApplication(context, applicationId, reason),
    archiveApplication: (applicationId: string, reason: string) =>
      archiveChangeApplication(context, applicationId, reason),
    restoreApplication: (applicationId: string, reason: string) =>
      restoreChangeApplication(context, applicationId, reason),
  }
}
