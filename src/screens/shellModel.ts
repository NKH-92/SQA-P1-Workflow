import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import type { AppNotification } from '../lib/notifications'

export type ShellTabState = {
  count?: number
  unread?: boolean
}

export type ShellModel = {
  memberCount: number
  unreadNotifications: number
  tabs: Partial<Record<TabId, ShellTabState>>
}

export function buildShellModel({
  data,
  profile,
  leaderMode,
  pendingCount,
  unreadReviewsCount,
  notifications,
}: {
  data: AppData
  profile: Profile
  leaderMode: boolean
  pendingCount: number
  unreadReviewsCount: number
  notifications: AppNotification[]
}): ShellModel {
  const memberCount = data.profiles.filter((item) => item.role === 'member').length
  const memberReviewCount = data.reviewRequests.filter((request) => request.requester_id === profile.id).length
  const memberProjectCount = data.projectAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberProductCount = data.productAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberDutyCount = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const pendingChangeTaskCount = data.productChangeTasks.filter(
    (task) => task.status === 'pending' && (leaderMode || task.assignee_id === profile.id),
  ).length
  const hasUnreadReviews = unreadReviewsCount > 0

  return {
    memberCount,
    unreadNotifications: notifications.filter((item) => item.unread).length,
    tabs: {
      announcements: { count: data.announcements.length },
      reviews: {
        count: hasUnreadReviews
          ? unreadReviewsCount
          : leaderMode ? pendingCount : memberReviewCount,
        unread: hasUnreadReviews,
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
