import type {
  AppData,
  ChangeActionItem,
  ChangeApplication,
  ChangeAssigneeOption,
  ChangeProductScopeRow,
  Duty,
  DutyAssignment,
  DutyMajorCategory,
  Product,
  ProductAssignment,
  ProductChangeTask,
  Profile,
  Project,
  ProjectAssignment,
  ReviewEvent,
  ReviewReadReceipt,
  ReviewRequest,
} from '../../types'
import { createEmptyAppData } from '../appData'
import type { ChangeQueryResults } from './changeQueries'
import type { CoreQueryResults } from './coreQueries'
import type { OptionalQueryResults, SettledQueryResult } from './optionalQueries'
import type { ReviewQueryResults } from './reviewQueries'

export type AssembledAppData = AppData & {
  optionalWarnings: string[]
}

export type CoreAppDataResults = CoreQueryResults & ReviewQueryResults & ChangeQueryResults
export type OptionalAppDataResults = OptionalQueryResults

type ReviewRequestMerger = (
  pending: ReviewRequest[] | null | undefined,
  recentClosed: ReviewRequest[] | null | undefined,
) => ReviewRequest[]

export const emptyAppData = createEmptyAppData

function optionalDataOrWarning<T>(
  result: SettledQueryResult<T>,
  label: string,
  warnings: string[],
  previous: T,
): T {
  if (result.status === 'rejected' || result.value.error) {
    warnings.push(`${label} 조회에 실패해 마지막 정상 데이터를 유지합니다.`)
    return previous
  }
  return (result.value.data ?? []) as T
}

export function assembleAppData(
  {
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    reviewEventsResult,
    reviewReadReceiptsResult,
    projectsResult,
    projectAssignmentsResult,
    changeApplicationsResult,
    changeActionItemsResult,
    productChangeTasksResult,
    changeProductScopeResult,
    changeAssigneeOptionsResult,
  }: CoreAppDataResults,
  optionalResults: OptionalAppDataResults,
  mergeReviewRequests: ReviewRequestMerger,
  previous: AppData = emptyAppData(),
): AssembledAppData {
  const optionalWarnings: string[] = []

  let profiles = (profilesResult.data ?? []) as Profile[]
  const leaderProfiles = optionalDataOrWarning(
    optionalResults.leaderProfiles,
    '파트장 프로필',
    optionalWarnings,
    [] as Array<Pick<Profile, 'id' | 'name'>>,
  )
  if (leaderProfiles.length > 0) {
    const knownIds = new Set(profiles.map((item) => item.id))
    profiles = [
      ...profiles,
      ...leaderProfiles
        .filter((leader) => !knownIds.has(leader.id))
        .map((leader) => ({
          id: leader.id,
          name: leader.name,
          email: '',
          role: 'leader' as const,
          is_active: true,
        })),
    ]
  }

  // Warning order is user-visible and intentionally differs from query order.
  const announcements = optionalDataOrWarning(optionalResults.announcements, '공지', optionalWarnings, previous.announcements)
  const allowedUsers = optionalDataOrWarning(optionalResults.allowedUsers, '초대 목록', optionalWarnings, previous.allowedUsers)
  const profileNotes = optionalDataOrWarning(optionalResults.profileNotes, '프로필 메모', optionalWarnings, previous.profileNotes)
  const activityLogs = optionalDataOrWarning(optionalResults.activityLogs, '활동 로그', optionalWarnings, previous.activityLogs)

  return {
    announcements,
    changeApplications: (changeApplicationsResult.data ?? []) as ChangeApplication[],
    changeActionItems: (changeActionItemsResult.data ?? []) as ChangeActionItem[],
    productChangeTasks: (productChangeTasksResult.data ?? []) as ProductChangeTask[],
    changeProductScope: (changeProductScopeResult.data ?? []) as ChangeProductScopeRow[],
    changeAssigneeOptions: (changeAssigneeOptionsResult.data ?? []) as ChangeAssigneeOption[],
    profiles,
    allowedUsers,
    products: (productsResult.data ?? []) as Product[],
    dutyMajorCategories: (dutyMajorCategoriesResult.data ?? []) as DutyMajorCategory[],
    duties: (dutiesResult.data ?? []) as Duty[],
    productAssignments: (productAssignmentsResult.data ?? []) as ProductAssignment[],
    dutyAssignments: (dutyAssignmentsResult.data ?? []) as DutyAssignment[],
    reviewRequests: mergeReviewRequests(reviewRequestsResult.data, null),
    reviewEvents: (reviewEventsResult?.data ?? []) as ReviewEvent[],
    reviewReadReceipts: (reviewReadReceiptsResult?.data ?? []) as ReviewReadReceipt[],
    auditEvents: [],
    projects: (projectsResult.data ?? []) as Project[],
    projectAssignments: (projectAssignmentsResult.data ?? []) as ProjectAssignment[],
    profileNotes,
    activityLogs,
    optionalWarnings,
  }
}
