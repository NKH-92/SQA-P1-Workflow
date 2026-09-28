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

// local 저장소는 미리보기(VITE_APP_MODE=preview)·개발 서버·vitest에서만 쓴다.
// Vite가 import.meta.env를 빌드 때 상수로 바꾸므로 운영·CI 빌드에서는 이 분기가 false로 접혀
// src/data/local/* 전체가 번들에서 빠진다. 운영 빌드에서 설정이 없으면 이미 설정 오류 화면이 떠서 local 경로에 닿지 않는다.
export const LOCAL_REPOSITORIES_ENABLED = import.meta.env.DEV || import.meta.env.VITE_APP_MODE === 'preview'

function localRepositoriesUnavailable(): never {
  throw new Error('local repositories are unavailable in this build')
}

export function createRepositorySet(
  mode: RepositoryMode,
  deps: Omit<RepositoryDeps, 'activityLogs'>,
): RepositorySet {
  if (mode !== 'remote' && !LOCAL_REPOSITORIES_ENABLED) localRepositoriesUnavailable()
  const activityLogs = mode === 'remote' || !LOCAL_REPOSITORIES_ENABLED
    ? createSupabaseActivityLogWriter()
    : createLocalActivityLogWriter(deps.setData)
  const repositoryDeps: RepositoryDeps = {
    get profile() { return deps.profile },
    get data() { return deps.data },
    setData(update) { deps.setData(update) },
    activityLogs,
  }
  return mode === 'remote' || !LOCAL_REPOSITORIES_ENABLED
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
