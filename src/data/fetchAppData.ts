import type {
  ActivityLog,
  AllowedUser,
  AppData,
  Duty,
  DutyAssignment,
  DutyMajorCategory,
  Product,
  ProductAssignment,
  Profile,
  Project,
  ProjectAssignment,
  ReviewRequest,
} from '../types'
import { supabase } from '../lib/supabase'

export type FetchAppDataResult = AppData & {
  optionalWarnings: string[]
}

function emptyAppData(): AppData {
  return {
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

function settledData<T>(result: PromiseSettledResult<{ data: T | null; error: unknown }>, label: string, warnings: string[]): T {
  if (result.status === 'rejected' || result.value.error) {
    warnings.push(`${label} 조회에 실패했습니다.`)
    return [] as T
  }
  return (result.value.data ?? []) as T
}

export async function fetchAppData(): Promise<FetchAppDataResult> {
  if (!supabase) return { ...emptyAppData(), optionalWarnings: [] }

  const [
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    projectsResult,
    projectAssignmentsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('products').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name'),
    supabase
      .from('duty_major_categories')
      .select('*')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabase
      .from('duties')
      .select('*, duty_major_categories(name,sort_order)')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name'),
    supabase
      .from('product_assignments')
      .select('*, profiles(name,email), products(name,category,company_name,sort_order)')
      .order('created_at', { ascending: false }),
    supabase
      .from('duty_assignments')
      .select('*, profiles(name,email), duties(name,major_category_id,duty_major_categories(name))')
      .order('created_at', { ascending: false }),
    supabase
      .from('review_requests')
      .select('*, profiles(name,email), review_feedback(*, profiles(name))')
      .order('created_at', { ascending: false })
      // Embedded feedback rows must be chronological — the UI highlights the last item as
      // the newest, which only holds if PostgREST returns them oldest-first.
      .order('created_at', { referencedTable: 'review_feedback', ascending: true }),
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase
      .from('project_assignments')
      .select('*, profiles(name,email), projects(name,description,deadline,status)')
      .order('created_at', { ascending: false }),
  ])

  const coreResults = [
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    projectsResult,
    projectAssignmentsResult,
  ]
  const failedCore = coreResults.find((result) => result.error)
  if (failedCore?.error) throw failedCore.error

  const optionalWarnings: string[] = []
  const optionalResults = await Promise.allSettled([
    supabase.from('allowed_users').select('*').order('created_at', { ascending: false }),
    supabase.from('profile_notes').select('*').order('created_at', { ascending: false }),
    supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
    supabase.from('public_leader_profiles').select('id,name'),
  ])

  let profiles = (profilesResult.data ?? []) as Profile[]
  const leaderProfiles = settledData(
    optionalResults[3] as PromiseSettledResult<{ data: Array<Pick<Profile, 'id' | 'name'>> | null; error: unknown }>,
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

  return {
    profiles,
    allowedUsers: settledData(
      optionalResults[0] as PromiseSettledResult<{ data: AllowedUser[] | null; error: unknown }>,
      '초대 목록',
      optionalWarnings,
    ),
    products: (productsResult.data ?? []) as Product[],
    dutyMajorCategories: (dutyMajorCategoriesResult.data ?? []) as DutyMajorCategory[],
    duties: (dutiesResult.data ?? []) as Duty[],
    productAssignments: (productAssignmentsResult.data ?? []) as ProductAssignment[],
    dutyAssignments: (dutyAssignmentsResult.data ?? []) as DutyAssignment[],
    reviewRequests: (reviewRequestsResult.data ?? []) as ReviewRequest[],
    projects: (projectsResult.data ?? []) as Project[],
    projectAssignments: (projectAssignmentsResult.data ?? []) as ProjectAssignment[],
    profileNotes: settledData(
      optionalResults[1] as PromiseSettledResult<{ data: AppData['profileNotes'] | null; error: unknown }>,
      '프로필 메모',
      optionalWarnings,
    ),
    activityLogs: settledData(
      optionalResults[2] as PromiseSettledResult<{ data: ActivityLog[] | null; error: unknown }>,
      '활동 로그',
      optionalWarnings,
    ),
    optionalWarnings,
  }
}
