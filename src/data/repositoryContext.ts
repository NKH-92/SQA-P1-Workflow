import type { AppData, Profile } from '../types'
import { hasSupabaseConfig } from '../lib/supabase'
import { createRepositorySet, type RepositoryMode } from './repositories/createRepositorySet'
import type { AppDataUpdater } from './repositories/appDataUpdater'
import type { RepositorySet } from './repositories/types'

export type RepositoryCapabilities = {
  historyIsCapped: boolean
  supportsAuditFeed: boolean
}

export type RepositoryContext = {
  mode: RepositoryMode
  capabilities: RepositoryCapabilities
  repositories: RepositorySet
  profile: Profile
  data: AppData
  setData: AppDataUpdater
}

export type RepositoryContextDeps = Pick<RepositoryContext, 'profile' | 'data' | 'setData'>

export function createRepositoryContextFromDeps(
  mode: RepositoryMode,
  deps: RepositoryContextDeps,
): RepositoryContext {
  const context: RepositoryContext = {
    mode,
    capabilities: {
      historyIsCapped: mode === 'remote',
      supportsAuditFeed: mode === 'remote',
    },
    repositories: undefined as unknown as RepositorySet,
    ...deps,
  }
  context.repositories = createRepositorySet(mode, {
    get profile() {
      return context.profile
    },
    get data() {
      return context.data
    },
    setData(update) {
      context.setData(update)
    },
  })
  return context
}

export function createRepositoryContextForMode(
  mode: RepositoryMode,
  profile: Profile,
  data: AppData,
  setData: AppDataUpdater,
): RepositoryContext {
  return createRepositoryContextFromDeps(mode, { profile, data, setData })
}

export function createRepositoryContext(
  profile: Profile,
  data: AppData,
  setData: AppDataUpdater,
): RepositoryContext {
  return createRepositoryContextForMode(hasSupabaseConfig ? 'remote' : 'local', profile, data, setData)
}
