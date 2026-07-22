import { useMemo } from 'react'
import {
  addAllowedUser,
  createRepositoryContext,
  deleteAllowedUser,
  importInvites,
  toggleProfileActive,
  updateInvite,
} from '../../../data'
import type { AppData, Profile } from '../../../types'
import type { AppDataUpdater } from '../../../data/repositories/appDataUpdater'

export function useInviteAdminController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(() => createRepositoryContext(profile, data, setData), [data, profile, setData])
  return {
    importRows: (rows: Parameters<typeof importInvites>[1]) => importInvites(context, rows),
    add: (input: Parameters<typeof addAllowedUser>[1]) => addAllowedUser(context, input),
    update: (id: string, input: Parameters<typeof updateInvite>[2]) => updateInvite(context, id, input),
    toggleProfile: (id: string, active: boolean, input: Parameters<typeof toggleProfileActive>[3]) =>
      toggleProfileActive(context, id, active, input),
    remove: (id: string, input: Parameters<typeof deleteAllowedUser>[2]) => deleteAllowedUser(context, id, input),
  }
}
