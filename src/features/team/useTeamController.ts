import { useMemo } from 'react'
import { addProfileNote, createRepositoryContext } from '../../data'
import type { AppData, Profile } from '../../types'
import type { AppDataUpdater } from '../../data/repositories/appDataUpdater'

export function useTeamController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(
    () => createRepositoryContext(profile, data, setData),
    [data, profile, setData],
  )
  return {
    addProfileNote: (profileId: string, note: string) => addProfileNote(context, { profileId, note }),
  }
}
