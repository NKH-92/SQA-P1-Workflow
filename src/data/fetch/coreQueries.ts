import { supabase } from '../../lib/supabase'
import type {
  CoreBootstrapV2Envelope,
  Duty,
  DutyAssignment,
  DutyMajorCategory,
  Product,
  ProductAssignment,
  Profile,
  Project,
  ProjectAssignment,
} from '../../types'
import {
  BootstrapEnvelopeInvalidError,
  checkBootstrapSchemaVersion,
  isStringArray,
  isValidIsoTimestamp,
  requireArrayFields,
} from './bootstrapEnvelope'

type Client = NonNullable<typeof supabase>
type QueryResult<T> = { data: T | null; error: unknown }

export const CORE_BOOTSTRAP_SCHEMA_VERSION = 2

export type CoreQueryResults = {
  profilesResult: QueryResult<Profile[]>
  activeLeaderProfilesResult: QueryResult<Array<Pick<Profile, 'id' | 'name'>>>
  productsResult: QueryResult<Product[]>
  dutyMajorCategoriesResult: QueryResult<DutyMajorCategory[]>
  dutiesResult: QueryResult<Duty[]>
  productAssignmentsResult: QueryResult<ProductAssignment[]>
  dutyAssignmentsResult: QueryResult<DutyAssignment[]>
  projectsResult: QueryResult<Project[]>
  projectAssignmentsResult: QueryResult<ProjectAssignment[]>
  /** Server clock_timestamp() when the whole envelope was read; null on error. */
  coreSnapshotAt: string | null
  coreWarnings: string[]
}

function failedCoreQueryResults(error: unknown): CoreQueryResults {
  const failed: QueryResult<never> = { data: null, error }
  return {
    profilesResult: failed,
    activeLeaderProfilesResult: failed,
    productsResult: failed,
    dutyMajorCategoriesResult: failed,
    dutiesResult: failed,
    productAssignmentsResult: failed,
    dutyAssignmentsResult: failed,
    projectsResult: failed,
    projectAssignmentsResult: failed,
    coreSnapshotAt: null,
    coreWarnings: [],
  }
}

/**
 * Replaces eight separate *unbounded* fetchAllPages() sweeps (profiles,
 * products, duty major categories, duties, product/duty assignments,
 * projects, project assignments) with a single-statement snapshot RPC,
 * so this combined reference data is never assembled from two different
 * underlying DB states within one refresh. The RPC re-checks role/RLS-shaped
 * visibility internally and returns the exact same field shapes every
 * existing caller (assembleAppData, controllers, selectors) already expects.
 */
export async function fetchCoreQueries(client: Client): Promise<CoreQueryResults> {
  const { data, error } = await client.rpc('get_core_bootstrap_v2')
  if (error) return failedCoreQueryResults(error)

  const envelope = (data ?? null) as CoreBootstrapV2Envelope | null
  const versionError = checkBootstrapSchemaVersion('get_core_bootstrap_v2', CORE_BOOTSTRAP_SCHEMA_VERSION, envelope)
  if (versionError) return failedCoreQueryResults(versionError)
  if (!envelope) return failedCoreQueryResults(new BootstrapEnvelopeInvalidError('get_core_bootstrap_v2', 'envelope'))

  if (!isValidIsoTimestamp(envelope.snapshot_at)) {
    return failedCoreQueryResults(new BootstrapEnvelopeInvalidError('get_core_bootstrap_v2', 'snapshot_at'))
  }
  if (!isStringArray(envelope.warnings)) {
    return failedCoreQueryResults(new BootstrapEnvelopeInvalidError('get_core_bootstrap_v2', 'warnings'))
  }
  const shapeError = requireArrayFields('get_core_bootstrap_v2', envelope.data, [
    'profiles',
    'leader_profiles',
    'products',
    'duty_major_categories',
    'duties',
    'product_assignments',
    'duty_assignments',
    'projects',
    'project_assignments',
  ])
  if (shapeError) return failedCoreQueryResults(shapeError)

  const bootstrapData = envelope.data
  return {
    profilesResult: { data: bootstrapData.profiles, error: null },
    activeLeaderProfilesResult: { data: bootstrapData.leader_profiles, error: null },
    productsResult: { data: bootstrapData.products, error: null },
    dutyMajorCategoriesResult: { data: bootstrapData.duty_major_categories, error: null },
    dutiesResult: { data: bootstrapData.duties, error: null },
    productAssignmentsResult: { data: bootstrapData.product_assignments, error: null },
    dutyAssignmentsResult: { data: bootstrapData.duty_assignments, error: null },
    projectsResult: { data: bootstrapData.projects, error: null },
    projectAssignmentsResult: { data: bootstrapData.project_assignments, error: null },
    coreSnapshotAt: envelope.snapshot_at,
    coreWarnings: envelope.warnings,
  }
}
