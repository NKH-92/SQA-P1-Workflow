import type { InviteAdminRepository, RepositoryDeps } from '../repositories/types'
import { createLocalMasterRepository } from './localMasterRepository'

export function createLocalInviteAdminRepository(deps: RepositoryDeps): InviteAdminRepository {
  const source = createLocalMasterRepository(deps)
  return {
    importInvites: source.importInvites,
    addAllowedUser: source.addAllowedUser,
    updateInvite: source.updateInvite,
    toggleProfileActive: source.toggleProfileActive,
    deleteAllowedUser: source.deleteAllowedUser,
  }
}
