import type { DutyAdminRepository, RepositoryDeps } from '../repositories/types'
import { createLocalMasterRepository } from './localMasterRepository'

export function createLocalDutyAdminRepository(deps: RepositoryDeps): DutyAdminRepository {
  const source = createLocalMasterRepository(deps)
  return {
    addDutyMajorCategory: source.addDutyMajorCategory,
    addDuty: source.addDuty,
    saveDutyAssignments: source.saveDutyAssignments,
    assignDuty: source.assignDuty,
    updateDutyMajorCategory: source.updateDutyMajorCategory,
    updateDuty: source.updateDuty,
    deleteDuty: source.deleteDuty,
    deleteDutyMajorCategory: source.deleteDutyMajorCategory,
  }
}
