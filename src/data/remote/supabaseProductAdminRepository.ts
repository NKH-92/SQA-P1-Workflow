import type { ProductAdminRepository, RepositoryDeps } from '../repositories/types'
import { createSupabaseMasterRepository } from './supabaseMasterRepository'

export function createSupabaseProductAdminRepository(deps: RepositoryDeps): ProductAdminRepository {
  const source = createSupabaseMasterRepository(deps)
  return {
    importProducts: source.importProducts,
    addProduct: source.addProduct,
    saveProductAssignments: source.saveProductAssignments,
    assignProduct: source.assignProduct,
    updateProduct: source.updateProduct,
    deleteProduct: source.deleteProduct,
  }
}
