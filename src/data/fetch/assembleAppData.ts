import type {
  ActivityLog,
  AllowedUser,
  Announcement,
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
  ReviewRequest,
} from '../../types'

type QueryResult<T> = { data: T | null; error: unknown }
type SettledQueryResult<T> = PromiseSettledResult<QueryResult<T>>

export type AssembledAppData = AppData & {
  optionalWarnings: string[]
}

export type CoreAppDataResults = {
  profilesResult: QueryResult<Profile[]>
  productsResult: QueryResult<Product[]>
  dutyMajorCategoriesResult: QueryResult<DutyMajorCategory[]>
  dutiesResult: QueryResult<Duty[]>
  productAssignmentsResult: QueryResult<ProductAssignment[]>
  dutyAssignmentsResult: QueryResult<DutyAssignment[]>
  reviewRequestsResult: QueryResult<ReviewRequest[]>
  projectsResult: QueryResult<Project[]>
  projectAssignmentsResult: QueryResult<ProjectAssignment[]>
  changeApplicationsResult: QueryResult<ChangeApplication[]>
  changeActionItemsResult: QueryResult<ChangeActionItem[]>
  productChangeTasksResult: QueryResult<ProductChangeTask[]>
  changeProductScopeResult: QueryResult<ChangeProductScopeRow[]>
  changeAssigneeOptionsResult: QueryResult<ChangeAssigneeOption[]>
}

export type OptionalAppDataResults = readonly [
  SettledQueryResult<AllowedUser[]>,
  SettledQueryResult<AppData['profileNotes']>,
  SettledQueryResult<ActivityLog[]>,
  SettledQueryResult<Array<Pick<Profile, 'id' | 'name'>>>,
  SettledQueryResult<Announcement[]>,
]

type ReviewRequestMerger = (
  pending: ReviewRequest[] | null | undefined,
  recentClosed: ReviewRequest[] | null | undefined,
) => ReviewRequest[]

export function emptyAppData(): AppData {
  return {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [],
    allowedUsers: [],
    products: [],
    dutyMajorCategories: [],
    duties: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
}

function optionalDataOrWarning<T>(
  result: SettledQueryResult<T>,
  label: string,
  warnings: string[],
): T {
  if (result.status === 'rejected' || result.value.error) {
    warnings.push(`${label} 조회에 실패했습니다.`)
    return [] as T
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
): AssembledAppData {
  const optionalWarnings: string[] = []

  let profiles = (profilesResult.data ?? []) as Profile[]
  const leaderProfiles = optionalDataOrWarning(
    optionalResults[3],
    '파트장 프로필',
    optionalWarnings,
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
  const announcements = optionalDataOrWarning(optionalResults[4], '공지', optionalWarnings)
  const allowedUsers = optionalDataOrWarning(optionalResults[0], '초대 목록', optionalWarnings)
  const profileNotes = optionalDataOrWarning(optionalResults[1], '프로필 메모', optionalWarnings)
  const activityLogs = optionalDataOrWarning(optionalResults[2], '활동 로그', optionalWarnings)

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
    projects: (projectsResult.data ?? []) as Project[],
    projectAssignments: (projectAssignmentsResult.data ?? []) as ProjectAssignment[],
    profileNotes,
    activityLogs,
    optionalWarnings,
  }
}
