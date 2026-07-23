import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import type { AppNotification } from '../lib/notifications'

export type ShellTabState = {
  count?: number
  unreadCount?: number
}

export type ShellModel = {
  memberCount: number
  unreadNotifications: number
  tabs: Partial<Record<TabId, ShellTabState>>
}

export type ShellFeatureData = Pick<
  AppData,
  | 'profiles'
  | 'reviewRequests'
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

export function buildShellModel({
  data,
  profile,
  leaderMode,
  pendingCount,
  unreadReviewsCount,
  notifications,
}: {
  data: ShellFeatureData
  profile: Profile
  leaderMode: boolean
  pendingCount: number
  unreadReviewsCount: number
  notifications: AppNotification[]
}): ShellModel {
  const memberCount = data.profiles.filter((item) => item.role === 'member' && item.is_active !== false).length
  const memberPendingReviewCount = data.reviewRequests.filter(
    (request) => request.requester_id === profile.id && request.status === 'pending',
  ).length
  const memberProjectCount = data.projectAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberProductCount = data.productAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberDutyCount = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const pendingChangeTaskCount = data.productChangeTasks.filter(
    (task) => task.status === 'pending' && (leaderMode || task.assignee_id === profile.id),
  ).length
  return {
    memberCount,
    unreadNotifications: notifications.filter((item) => item.unread).length,
    tabs: {
      announcements: { count: data.announcements.length },
      reviews: {
        count: leaderMode ? pendingCount : memberPendingReviewCount,
        unreadCount: unreadReviewsCount,
      },
      'change-applications': { count: pendingChangeTaskCount },
      projects: {
        count: leaderMode ? data.projects.length : memberProjectCount,
      },
      team: { count: memberCount },
      activity: { count: data.activityLogs.length },
      products: { count: data.products.length },
      duties: { count: data.duties.length },
      invites: { count: data.allowedUsers.length },
      work: { count: memberProductCount + memberDutyCount },
    },
  }
}
