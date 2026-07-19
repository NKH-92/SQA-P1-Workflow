import type { DutyAdminRepository, RepositoryDeps } from '../repositories/types'
import { createSupabaseMasterRepository } from './supabaseMasterRepository'

export function createSupabaseDutyAdminRepository(deps: RepositoryDeps): DutyAdminRepository {
  const source = createSupabaseMasterRepository(deps)
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
