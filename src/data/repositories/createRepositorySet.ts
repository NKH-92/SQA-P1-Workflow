import { createLocalAnnouncementRepository } from '../local/localAnnouncementRepository'
import { createLocalChangeApplicationRepository } from '../local/localChangeApplicationRepository'
import { createLocalMasterRepository } from '../local/localMasterRepository'
import { createLocalProjectRepository } from '../local/localProjectRepository'
import { createLocalReviewRepository } from '../local/localReviewRepository'
import { createSupabaseAnnouncementRepository } from '../remote/supabaseAnnouncementRepository'
import { createSupabaseChangeApplicationRepository } from '../remote/supabaseChangeApplicationRepository'
import { createSupabaseMasterRepository } from '../remote/supabaseMasterRepository'
import { createSupabaseProjectRepository } from '../remote/supabaseProjectRepository'
import { createSupabaseReviewRepository } from '../remote/supabaseReviewRepository'
import type { RepositoryDeps, RepositorySet } from './types'

export type RepositoryMode = 'local' | 'remote'

export function createRepositorySet(mode: RepositoryMode, deps: RepositoryDeps): RepositorySet {
  return mode === 'remote'
    ? {
        get reviews() { return createSupabaseReviewRepository(deps) },
        get projects() { return createSupabaseProjectRepository(deps) },
        get announcements() { return createSupabaseAnnouncementRepository(deps) },
        get changeApplications() { return createSupabaseChangeApplicationRepository(deps) },
        get master() { return createSupabaseMasterRepository(deps) },
      }
    : {
        get reviews() { return createLocalReviewRepository(deps) },
        get projects() { return createLocalProjectRepository(deps) },
        get announcements() { return createLocalAnnouncementRepository(deps) },
        get changeApplications() { return createLocalChangeApplicationRepository(deps) },
        get master() { return createLocalMasterRepository(deps) },
      }
}
