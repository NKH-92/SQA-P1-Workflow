import { useMemo } from 'react'
import {
  addDutyMajorCategory,
  createRepositoryContext,
  deleteDuty,
  deleteDutyMajorCategory,
  saveDutyAllocation,
  updateDutyMajorCategory,
} from '../../../data'
import type { AppData, Profile } from '../../../types'
import type { AppDataUpdater } from '../../../data/repositories/appDataUpdater'

export function useDutyAdminController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(() => createRepositoryContext(profile, data, setData), [data, profile, setData])
  return {
    addCategory: (input: Parameters<typeof addDutyMajorCategory>[1]) => addDutyMajorCategory(context, input),
    save: (input: Parameters<typeof saveDutyAllocation>[1]) => saveDutyAllocation(context, input),
    updateCategory: (id: string, input: Parameters<typeof updateDutyMajorCategory>[2]) =>
      updateDutyMajorCategory(context, id, input),
    remove: (id: string, input: Parameters<typeof deleteDuty>[2]) => deleteDuty(context, id, input),
    removeCategory: (id: string, input: Parameters<typeof deleteDutyMajorCategory>[2]) =>
      deleteDutyMajorCategory(context, id, input),
  }
}
