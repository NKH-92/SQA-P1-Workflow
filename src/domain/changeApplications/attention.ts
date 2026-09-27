import type { AppData, ChangeApplication, ProductChangeTask } from '../../types'
import { selectOrBuildChangeApplicationSummary } from './completion'
import { selectProductChangeTaskContexts, type ProductChangeTaskContext } from './taskContexts'

export type ChangeAttentionData = Pick<
  AppData,
  'changeApplications' | 'changeApplicationSummaries' | 'changeActionItems' | 'productChangeTasks'
>

/**
 * 파트장이 직접 손대야 하는 공통변경: 최종 확인을 기다리거나, 담당자 없는 적용 업무가 남은 것.
 * 메뉴 배지와 홈 사무실 문서함 알림이 같은 기준을 쓴다.
 */
export function selectLeaderChangeActions(data: ChangeAttentionData): ChangeApplication[] {
  const actionApplicationIds = new Map(
    data.changeActionItems.map((item) => [item.id, item.change_application_id]),
  )
  const tasksByApplication = new Map<string, ProductChangeTask[]>()
  for (const task of data.productChangeTasks) {
    const applicationId = actionApplicationIds.get(task.action_item_id)
    if (!applicationId) continue
    const current = tasksByApplication.get(applicationId) ?? []
    current.push(task)
    tasksByApplication.set(applicationId, current)
  }
  return data.changeApplications.filter((application) => {
    const tasks = tasksByApplication.get(application.id) ?? []
    const summary = selectOrBuildChangeApplicationSummary(
      application,
      tasks,
      data.changeApplicationSummaries ?? [],
    )
    if (summary.workflow_status === 'final_review_ready') return true
    return summary.workflow_status === 'in_progress'
      && tasks.some((task) => task.status === 'pending' && !task.assignee_id)
  })
}

/** 파트원이 처리할 적용 업무: 배포된 공통변경의 내 미적용 업무. */
export function selectMemberPendingTasks(data: ChangeAttentionData, profileId: string): ProductChangeTaskContext[] {
  return selectProductChangeTaskContexts(data).filter(
    ({ task, application }) =>
      application.status === 'published'
      && !application.archived_at
      && !application.final_completed_at
      && task.status === 'pending'
      && task.assignee_id === profileId,
  )
}
