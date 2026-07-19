import type { ProductAdminRepository, RepositoryDeps } from '../repositories/types'
import { createLocalMasterRepository } from './localMasterRepository'

export function createLocalProductAdminRepository(deps: RepositoryDeps): ProductAdminRepository {
  const source = createLocalMasterRepository(deps)
  return {
    importProducts: source.importProducts,
    addProduct: source.addProduct,
    saveProductAssignments: source.saveProductAssignments,
    assignProduct: source.assignProduct,
    updateProduct: source.updateProduct,
    deleteProduct: source.deleteProduct,
  }
}
