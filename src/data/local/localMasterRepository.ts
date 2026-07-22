import type { MasterRepository, RepositoryDeps } from '../repositories/types'
import { createLocalDutyAdminRepository } from './localDutyAdminRepository'
import { createLocalInviteAdminRepository } from './localInviteAdminRepository'
import { createLocalProductAdminRepository } from './localProductAdminRepository'

/** Compatibility facade for callers that still consume the aggregate local master repository. */
export function createLocalMasterRepository(deps: RepositoryDeps): MasterRepository {
  return {
    ...createLocalProductAdminRepository(deps),
    ...createLocalDutyAdminRepository(deps),
    ...createLocalInviteAdminRepository(deps),
  }
}
