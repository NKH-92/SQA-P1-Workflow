import { supabase } from '../../lib/supabase'
import type {
  Duty,
  DutyAssignment,
  DutyMajorCategory,
  Product,
  ProductAssignment,
  Profile,
  Project,
  ProjectAssignment,
} from '../../types'
import { fetchAllPages } from './pagination'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }

export type CoreQueryResults = {
  profilesResult: QueryResult<Profile[]>
  productsResult: QueryResult<Product[]>
  dutyMajorCategoriesResult: QueryResult<DutyMajorCategory[]>
  dutiesResult: QueryResult<Duty[]>
  productAssignmentsResult: QueryResult<ProductAssignment[]>
  dutyAssignmentsResult: QueryResult<DutyAssignment[]>
  projectsResult: QueryResult<Project[]>
  projectAssignmentsResult: QueryResult<ProjectAssignment[]>
}

export type ReferenceQueryResults = Omit<CoreQueryResults, 'projectsResult' | 'projectAssignmentsResult'>
export type ProjectQueryResults = Pick<CoreQueryResults, 'projectsResult' | 'projectAssignmentsResult'>

export async function fetchCoreQueries(client: Client): Promise<ReferenceQueryResults> {
  const [
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
  ] = await Promise.all([
    fetchAllPages((from, to) => client.from('profiles').select('*').order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('products').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('duty_major_categories').select('*').order('sort_order', { ascending: true, nullsFirst: false }).order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('duties').select('*, duty_major_categories(name,sort_order)').order('sort_order', { ascending: true, nullsFirst: false }).order('name').range(from, to)),
    fetchAllPages((from, to) => client.from('product_assignments').select('*, profiles(name,email), products(name,category,company_name,sort_order)').order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages((from, to) => client.from('duty_assignments').select('*, profiles(name,email), duties(name,major_category_id,duty_major_categories(name))').order('created_at', { ascending: false }).range(from, to)),
  ])
  return {
    profilesResult,
    productsResult,
    dutyMajorCategoriesResult,
    dutiesResult,
    productAssignmentsResult,
    dutyAssignmentsResult,
  } as ReferenceQueryResults
}

export async function fetchProjectQueries(client: Client): Promise<ProjectQueryResults> {
  const [projectsResult, projectAssignmentsResult] = await Promise.all([
    fetchAllPages((from, to) => client.from('projects').select('*').order('created_at', { ascending: false }).range(from, to)),
    fetchAllPages((from, to) => client.from('project_assignments').select('*, profiles(name,email), projects(name,description,deadline,status)').order('created_at', { ascending: false }).range(from, to)),
  ])
  return { projectsResult, projectAssignmentsResult } as ProjectQueryResults
}
