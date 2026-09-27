import { createLocalAnnouncementRepository } from '../local/localAnnouncementRepository'
import { createLocalActivityLogWriter } from '../local/localActivityLogWriter'
import { createLocalChangeApplicationRepository } from '../local/localChangeApplicationRepository'
import { createLocalDutyAdminRepository } from '../local/localDutyAdminRepository'
import { createLocalInviteAdminRepository } from '../local/localInviteAdminRepository'
import { createLocalOfficeRepository } from '../local/localOfficeRepository'
import { createLocalOfficeMeetingRepository } from '../local/localOfficeMeetingRepository'
import { createLocalPresenceRepository } from '../local/localPresenceRepository'
import { createLocalProductAdminRepository } from '../local/localProductAdminRepository'
import { createLocalProjectRepository } from '../local/localProjectRepository'
import { createLocalReadMarkRepository } from '../local/localReadMarkRepository'
import { createLocalReviewRepository } from '../local/localReviewRepository'
import { createLocalTeamRepository } from '../local/localTeamRepository'
import { createSupabaseAnnouncementRepository } from '../remote/supabaseAnnouncementRepository'
import { createSupabaseActivityLogWriter } from '../remote/supabaseActivityLogWriter'
import { createSupabaseChangeApplicationRepository } from '../remote/supabaseChangeApplicationRepository'
import { createSupabaseDutyAdminRepository } from '../remote/supabaseDutyAdminRepository'
import { createSupabaseInviteAdminRepository } from '../remote/supabaseInviteAdminRepository'
import { createSupabaseOfficeRepository } from '../remote/supabaseOfficeRepository'
import { createSupabaseOfficeMeetingRepository } from '../remote/supabaseOfficeMeetingRepository'
import { createSupabasePresenceRepository } from '../remote/supabasePresenceRepository'
import { createSupabaseProductAdminRepository } from '../remote/supabaseProductAdminRepository'
import { createSupabaseProjectRepository } from '../remote/supabaseProjectRepository'
import { createSupabaseReadMarkRepository } from '../remote/supabaseReadMarkRepository'
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
        get products() { return createSupabaseProductAdminRepository(repositoryDeps) },
        get duties() { return createSupabaseDutyAdminRepository(repositoryDeps) },
        get invites() { return createSupabaseInviteAdminRepository(repositoryDeps) },
        get team() { return createSupabaseTeamRepository(repositoryDeps) },
        get office() { return createSupabaseOfficeRepository(repositoryDeps) },
        get readMarks() { return createSupabaseReadMarkRepository(repositoryDeps) },
        get meetings() { return createSupabaseOfficeMeetingRepository(repositoryDeps) },
        get presence() { return createSupabasePresenceRepository(repositoryDeps) },
        activityLogs,
      }
    : {
        get reviews() { return createLocalReviewRepository(repositoryDeps) },
        get projects() { return createLocalProjectRepository(repositoryDeps) },
        get announcements() { return createLocalAnnouncementRepository(repositoryDeps) },
        get changeApplications() { return createLocalChangeApplicationRepository(repositoryDeps) },
        get products() { return createLocalProductAdminRepository(repositoryDeps) },
        get duties() { return createLocalDutyAdminRepository(repositoryDeps) },
        get invites() { return createLocalInviteAdminRepository(repositoryDeps) },
        get team() { return createLocalTeamRepository(repositoryDeps) },
        get office() { return createLocalOfficeRepository(repositoryDeps) },
        get readMarks() { return createLocalReadMarkRepository(repositoryDeps) },
        get meetings() { return createLocalOfficeMeetingRepository(repositoryDeps) },
        get presence() { return createLocalPresenceRepository(repositoryDeps) },
        activityLogs,
      }
}
