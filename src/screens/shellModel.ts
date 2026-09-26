import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import type { AppNotification } from '../lib/notifications'
import { selectOrBuildChangeApplicationSummary } from '../domain/changeApplications/completion'
import { selectProductChangeTaskContexts } from '../domain/changeApplications/taskContexts'

/**
 * 메뉴 배지는 ‘내가 처리할 것’만 숫자 하나로 보여 준다(토스 GR-5·GR-9).
 * 전체 개수는 각 화면 머리말에서 보고, 읽지 않은 새 소식은 숫자 대신 점으로 표시한다.
 */
export type ShellTabState = {
  /** 내가 처리할 항목 수. 0이면 배지를 그리지 않는다. */
  count?: number
  /** 배지 숫자의 뜻(보조기기용). 예: ‘대기 3건’ */
  countLabel?: string
  /** 읽지 않은 새 소식 수. 화면에는 점으로만 보인다. */
  unreadCount?: number
  /** 숫자 없이 점으로 알리는 확인 필요 표시(보조기기용 설명). 예: 담당자 없는 제품 */
  attention?: string
}

export type ShellModel = {
  unreadNotifications: number
  tabs: Partial<Record<TabId, ShellTabState>>
}

export type ShellFeatureData = Pick<
  AppData,
  | 'profiles'
  | 'reviewRequests'
  | 'changeApplications'
  | 'changeApplicationSummaries'
  | 'changeActionItems'
  | 'productChangeTasks'
  | 'projects'
  | 'projectAssignments'
  | 'announcements'
  | 'activityLogs'
  | 'products'
  | 'productAssignments'
  | 'duties'
  | 'dutyAssignments'
  | 'allowedUsers'
>

/** 파트장이 직접 손대야 하는 공통변경: 최종 확인을 기다리거나, 담당자 없는 적용 업무가 남은 것. */
function countLeaderChangeActions(data: ShellFeatureData) {
  const actionApplicationIds = new Map(
    data.changeActionItems.map((item) => [item.id, item.change_application_id]),
  )
  const tasksByApplication = new Map<string, typeof data.productChangeTasks>()
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
  }).length
}

/** 파트원이 처리할 적용 업무: 배포된 공통변경의 내 미적용 업무. */
function countMemberPendingTasks(data: ShellFeatureData, profile: Profile) {
  return selectProductChangeTaskContexts(data).filter(
    ({ task, application }) =>
      application.status === 'published'
      && !application.archived_at
      && !application.final_completed_at
      && task.status === 'pending'
      && task.assignee_id === profile.id,
  ).length
}

export function buildShellModel({
  data,
  profile,
  leaderMode,
  canManage = leaderMode,
  pendingCount,
  unreadReviewsCount,
  notifications,
}: {
  data: ShellFeatureData
  profile: Profile
  leaderMode: boolean
  /** 수정 권한(canManageTeamData). 읽기 전용(팀장)은 처리할 일이 없으므로 배지를 달지 않는다. */
  canManage?: boolean
  pendingCount: number
  unreadReviewsCount: number
  notifications: AppNotification[]
}): ShellModel {
  const unreadNotifications = notifications.filter((item) => item.unread).length

  if (leaderMode && !canManage) {
    return { unreadNotifications, tabs: {} }
  }

  if (leaderMode) {
    const changeActionCount = countLeaderChangeActions(data)
    const assignedProductIds = new Set(data.productAssignments.map((assignment) => assignment.product_id))
    const hasUnassignedProduct = data.products.some((product) => !assignedProductIds.has(product.id))
    return {
      unreadNotifications,
      tabs: {
        reviews: {
          count: pendingCount,
          countLabel: `대기 ${pendingCount}건`,
          unreadCount: unreadReviewsCount,
        },
        'change-applications': {
          count: changeActionCount,
          countLabel: `확인할 공통변경 ${changeActionCount}건`,
        },
        ...(hasUnassignedProduct ? { products: { attention: '담당자 없는 제품 있음' } } : {}),
      },
    }
  }

  const pendingTaskCount = countMemberPendingTasks(data, profile)
  return {
    unreadNotifications,
    tabs: {
      reviews: { unreadCount: unreadReviewsCount },
      'change-applications': {
        count: pendingTaskCount,
        countLabel: `미적용 ${pendingTaskCount}건`,
      },
    },
  }
}

/** 배지가 있는 메뉴의 접근 가능한 이름. 예: ‘검토요청, 대기 3건, 새 소식 2건’ */
export function shellTabAccessibleName(label: string, state: ShellTabState | undefined) {
  if (!state) return undefined
  const parts = [label]
  if (state.count && state.countLabel) parts.push(state.countLabel)
  if (state.unreadCount) parts.push(`새 소식 ${state.unreadCount}건`)
  if (state.attention) parts.push(state.attention)
  return parts.length > 1 ? parts.join(', ') : undefined
}
