import type { Dispatch, SetStateAction } from 'react'
import type { AppData, Profile } from '../types'
import { hasSupabaseConfig } from '../lib/supabase'

export type RepositoryContext = {
  isRemote: boolean
  profile: Profile
  data: AppData
  setData: Dispatch<SetStateAction<AppData>>
}

export function createRepositoryContext(
  profile: Profile,
  data: AppData,
  setData: Dispatch<SetStateAction<AppData>>,
): RepositoryContext {
  return {
    isRemote: hasSupabaseConfig,
    profile,
    data,
    setData,
  }
}
