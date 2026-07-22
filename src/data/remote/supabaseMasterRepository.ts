import type { MasterRepository, RepositoryDeps } from '../repositories/types'
import { createSupabaseDutyAdminRepository } from './supabaseDutyAdminRepository'
import { createSupabaseInviteAdminRepository } from './supabaseInviteAdminRepository'
import { createSupabaseProductAdminRepository } from './supabaseProductAdminRepository'

/**
 * Compatibility facade for callers that still consume the original aggregate
 * master repository. Domain repositories own the implementation; this factory
 * only composes their existing method contracts.
 */
export function createSupabaseMasterRepository(ctx: RepositoryDeps): MasterRepository {
  const products = createSupabaseProductAdminRepository(ctx)
  const duties = createSupabaseDutyAdminRepository(ctx)
  const invites = createSupabaseInviteAdminRepository(ctx)

  return {
    importProducts: products.importProducts,
    importInvites: invites.importInvites,
    addAllowedUser: invites.addAllowedUser,
    addProduct: products.addProduct,
    addDutyMajorCategory: duties.addDutyMajorCategory,
    addDuty: duties.addDuty,
    saveProductAssignments: products.saveProductAssignments,
    saveDutyAssignments: duties.saveDutyAssignments,
    assignProduct: products.assignProduct,
    assignDuty: duties.assignDuty,
    updateProduct: products.updateProduct,
    updateDutyMajorCategory: duties.updateDutyMajorCategory,
    updateDuty: duties.updateDuty,
    updateInvite: invites.updateInvite,
    toggleProfileActive: invites.toggleProfileActive,
    setProfileRole: invites.setProfileRole,
    deleteAllowedUser: invites.deleteAllowedUser,
    deleteProduct: products.deleteProduct,
    deleteDuty: duties.deleteDuty,
    deleteDutyMajorCategory: duties.deleteDutyMajorCategory,
  }
}
