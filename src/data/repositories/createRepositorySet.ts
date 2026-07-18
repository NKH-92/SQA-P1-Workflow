import { createLocalAnnouncementRepository } from '../local/localAnnouncementRepository'
import { createLocalActivityLogWriter } from '../local/localActivityLogWriter'
import { createLocalChangeApplicationRepository } from '../local/localChangeApplicationRepository'
import { createLocalMasterRepository } from '../local/localMasterRepository'
import { createLocalProjectRepository } from '../local/localProjectRepository'
import { createLocalReviewRepository } from '../local/localReviewRepository'
import { createLocalTeamRepository } from '../local/localTeamRepository'
import { createSupabaseAnnouncementRepository } from '../remote/supabaseAnnouncementRepository'
import { createSupabaseActivityLogWriter } from '../remote/supabaseActivityLogWriter'
import { createSupabaseChangeApplicationRepository } from '../remote/supabaseChangeApplicationRepository'
import { createSupabaseMasterRepository } from '../remote/supabaseMasterRepository'
import { createSupabaseProjectRepository } from '../remote/supabaseProjectRepository'
import { createSupabaseReviewRepository } from '../remote/supabaseReviewRepository'
import { createSupabaseTeamRepository } from '../remote/supabaseTeamRepository'
import type { RepositoryDeps, RepositorySet } from './types'

export type RepositoryMode = 'local' | 'remote'

export function createRepositorySet(
  mode: RepositoryMode,
  deps: Omit<RepositoryDeps, 'activityLogs'>,
): RepositorySet {
  const activityLogs = mode === 'remote'
    ? createSupabaseActivityLogWriter()
    : createLocalActivityLogWriter(deps.setData)
  const repositoryDeps: RepositoryDeps = {
    get profile() { return deps.profile },
    get data() { return deps.data },
    setData(update) { deps.setData(update) },
    activityLogs,
  }
  return mode === 'remote'
    ? {
        get reviews() { return createSupabaseReviewRepository(repositoryDeps) },
        get projects() { return createSupabaseProjectRepository(repositoryDeps) },
        get announcements() { return createSupabaseAnnouncementRepository(repositoryDeps) },
        get changeApplications() { return createSupabaseChangeApplicationRepository(repositoryDeps) },
        get master() { return createSupabaseMasterRepository(repositoryDeps) },
        get team() { return createSupabaseTeamRepository(repositoryDeps) },
        activityLogs,
      }
    : {
        get reviews() { return createLocalReviewRepository(repositoryDeps) },
        get projects() { return createLocalProjectRepository(repositoryDeps) },
        get announcements() { return createLocalAnnouncementRepository(repositoryDeps) },
        get changeApplications() { return createLocalChangeApplicationRepository(repositoryDeps) },
        get master() { return createLocalMasterRepository(repositoryDeps) },
        get team() { return createLocalTeamRepository(repositoryDeps) },
        activityLogs,
      }
}
