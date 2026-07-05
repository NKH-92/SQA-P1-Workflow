import type {
  ActivityLog,
  AllowedUser,
  AppData,
  Duty,
  DutyAssignment,
  Product,
  ProductAssignment,
  Profile,
  Project,
  ProjectAssignment,
  ReviewRequest,
} from '../types'
import { supabase } from '../lib/supabase'

export async function fetchAppData(): Promise<AppData> {
  if (!supabase) return {
    profiles: [],
    allowedUsers: [],
    products: [],
    duties: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }

  const [
    profilesResult,
    allowedUsersResult,
    productsResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    projectsResult,
    projectAssignmentsResult,
    profileNotesResult,
    activityLogsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('*').order('name'),
    supabase.from('allowed_users').select('*').order('created_at', { ascending: false }),
    supabase.from('products').select('*').order('name'),
    supabase.from('duties').select('*').order('name'),
    supabase
      .from('product_assignments')
      .select('*, profiles(name,email), products(name,code)')
      .order('created_at', { ascending: false }),
    supabase
      .from('duty_assignments')
      .select('*, profiles(name,email), duties(name)')
      .order('created_at', { ascending: false }),
    supabase
      .from('review_requests')
      .select('*, profiles(name,email), review_feedback(*, profiles(name))')
      .order('created_at', { ascending: false }),
    supabase.from('projects').select('*').order('created_at', { ascending: false }),
    supabase
      .from('project_assignments')
      .select('*, profiles(name,email), projects(name,description,deadline,status)')
      .order('created_at', { ascending: false }),
    supabase.from('profile_notes').select('*').order('created_at', { ascending: false }),
    supabase.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(100),
  ])

  const results = [
    profilesResult,
    allowedUsersResult,
    productsResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
    reviewRequestsResult,
    projectsResult,
    projectAssignmentsResult,
    profileNotesResult,
    activityLogsResult,
  ]
  const failed = results.find((result) => result.error)
  if (failed?.error) throw failed.error

  return {
    profiles: (profilesResult.data ?? []) as Profile[],
    allowedUsers: (allowedUsersResult.data ?? []) as AllowedUser[],
    products: (productsResult.data ?? []) as Product[],
    duties: (dutiesResult.data ?? []) as Duty[],
    productAssignments: (productAssignmentsResult.data ?? []) as ProductAssignment[],
    dutyAssignments: (dutyAssignmentsResult.data ?? []) as DutyAssignment[],
    reviewRequests: (reviewRequestsResult.data ?? []) as ReviewRequest[],
    projects: (projectsResult.data ?? []) as Project[],
    projectAssignments: (projectAssignmentsResult.data ?? []) as ProjectAssignment[],
    profileNotes: (profileNotesResult.data ?? []) as AppData['profileNotes'],
    activityLogs: (activityLogsResult.data ?? []) as ActivityLog[],
  }
}
