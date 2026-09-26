import type {
  AppData,
  ChangeActionItem,
  ChangeApplication,
  ChangeApplicationSummary,
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

/** 부가 데이터를 불러오지 못해 이전 내용을 보여 줄 때의 안내. 화면 위 경고 배너에 나온다. */
export function optionalLoadFailureWarning(label: string) {
  return `${label}: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.`
}

/**
 * 목록이 표시 상한을 넘었다는 안내. 실패가 아니라 평상시 상태라 화면은 경고가 아닌 정보로 보여 준다
 * (useAppData의 splitDataWarnings가 ‘…건까지만 보여요.’로 끝나는 문구를 안내로 분류한다).
 */
export function listCapNotice(label: string, cap: number) {
  return `${label}: 최근 ${cap.toLocaleString('ko-KR')}건까지만 보여요.`
}

function optionalDataOrWarning<T>(
  result: SettledQueryResult<T>,
  label: string,
  warnings: string[],
  previous: T,
): T {
  if (result.status === 'rejected' || result.value.error) {
    warnings.push(optionalLoadFailureWarning(label))
    return previous
  }
  return (result.value.data ?? []) as T
}

function optionalCappedRowsOrWarning<T>(
  result: SettledQueryResult<T[]>,
  label: string,
  warnings: string[],
  previous: T[],
  cap: number,
): T[] {
  const rows = optionalDataOrWarning(result, label, warnings, previous)
  if (rows.length > cap) {
    warnings.push(listCapNotice(label, cap))
  }
  return rows.slice(0, cap)
}

export function assembleAppData(
  {
    profilesResult,
    activeLeaderProfilesResult,
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
    changeApplicationSummariesResult,
  }: CoreAppDataResults,
  optionalResults: OptionalAppDataResults,
  mergeReviewRequests: ReviewRequestMerger,
  previous: AppData = emptyAppData(),
): AssembledAppData {
  const optionalWarnings: string[] = []

  let profiles = (profilesResult.data ?? []) as Profile[]
  // get_core_bootstrap_v2 already returns the authoritative active-leader
  // directory in the same snapshot. Avoid a redundant view request (and its
  // separate snapshot/security-definer surface) while preserving member-visible
  // leader names that are intentionally absent from the regular profiles rows.
  const leaderProfiles = activeLeaderProfilesResult.data ?? []
  if (leaderProfiles.length > 0) {
    // Required profiles are authoritative: any id already present there (even with
    // a changed role or inactive status) must win over a stale leader fallback, so
    // a deleted/demoted leader can never be resurrected by an optional-query outage.
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
  const announcements = optionalCappedRowsOrWarning(optionalResults.announcements, '공지', optionalWarnings, previous.announcements, 200)
  const allowedUsers = optionalCappedRowsOrWarning(optionalResults.allowedUsers, '계정 목록', optionalWarnings, previous.allowedUsers, 1000)
  const profileNotes = optionalCappedRowsOrWarning(optionalResults.profileNotes, '관리 메모', optionalWarnings, previous.profileNotes, 1000)
  // Activity history is intentionally a recent-100 view. Its persistent cap is
  // explained in ActivityPanel and must not be reported as a retryable outage.
  const activityLogs = optionalDataOrWarning(
    optionalResults.activityLogs,
    '활동 로그',
    optionalWarnings,
    previous.activityLogs,
  ).slice(0, 100)

  return {
    announcements,
    changeApplications: (changeApplicationsResult.data ?? []) as ChangeApplication[],
    changeApplicationSummaries: (changeApplicationSummariesResult.data ?? []) as ChangeApplicationSummary[],
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
