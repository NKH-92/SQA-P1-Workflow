import type { InviteAdminRepository, RepositoryDeps } from '../repositories/types'
import { createSupabaseMasterRepository } from './supabaseMasterRepository'

export function createSupabaseInviteAdminRepository(deps: RepositoryDeps): InviteAdminRepository {
  const source = createSupabaseMasterRepository(deps)
  return {
    importInvites: source.importInvites,
    addAllowedUser: source.addAllowedUser,
    updateInvite: source.updateInvite,
    toggleProfileActive: source.toggleProfileActive,
    deleteAllowedUser: source.deleteAllowedUser,
  }
}
