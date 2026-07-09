import { previewLeader as demoLeader, previewMember as demoMember } from '../demoData'
import { canManageTeamData } from '../domain/permissions'
import { isPreviewMode } from '../lib/supabase'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId, ToastMessage } from './types'
import {
  ActivityPanel,
  Dashboard,
  LeaderDashboard,
  MasterPanel,
  MyWorkPanel,
  ProjectsPanel,
  ReviewsPanel,
  TeamPanel,
} from '../screens'

type AppRoutesProps = {
  activeTab: TabId
  navEntityId: string | null
  setNavEntityId: (id: string | null) => void
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: React.Dispatch<React.SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>
  setMessage: React.Dispatch<React.SetStateAction<ToastMessage | null>>
  refreshData: () => Promise<void>
  /** 검토 리스트 미확인 dot의 기준 시각(App이 탭 진입 시 캡처). null이면 dot을 켜지 않는다. */
  reviewsUnreadCutoff: string | null
}

export function AppRoutes({
  activeTab,
  navEntityId,
  setNavEntityId,
  profile,
  data,
  mutate,
  setData,
  setActiveTab,
  setProfile: _setProfile,
  setMessage: _setMessage,
  refreshData: _refreshData,
  reviewsUnreadCutoff,
}: AppRoutesProps) {
  const leaderMode = canManageTeamData(profile)

  return (
    <>
      {activeTab === 'dashboard' &&
        (leaderMode ? (
          <LeaderDashboard profile={profile} data={data} setActiveTab={setActiveTab} />
        ) : (
          <Dashboard profile={profile} data={data} mutate={mutate} setData={setData} setActiveTab={setActiveTab} />
        ))}
      {activeTab === 'work' && !leaderMode && <MyWorkPanel profile={profile} data={data} />}
      {activeTab === 'reviews' && (
        <ReviewsPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          initialSelectedId={navEntityId}
          onInitialSelectionApplied={() => setNavEntityId(null)}
          reviewsUnreadCutoff={reviewsUnreadCutoff}
        />
      )}
      {activeTab === 'projects' && <ProjectsPanel profile={profile} data={data} mutate={mutate} setData={setData} />}
      {activeTab === 'team' && leaderMode && (
        <TeamPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          setActiveTab={setActiveTab}
          initialSelectedId={navEntityId}
          onInitialSelectionApplied={() => setNavEntityId(null)}
        />
      )}
      {(activeTab === 'products' || activeTab === 'duties' || activeTab === 'invites') && leaderMode && (
        <MasterPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          masterView={activeTab}
          setActiveTab={setActiveTab}
        />
      )}
      {activeTab === 'activity' && leaderMode && <ActivityPanel data={data} />}
    </>
  )
}

export function usePreviewRoleChange(setProfile: AppRoutesProps['setProfile'], setActiveTab: AppRoutesProps['setActiveTab']) {
  if (!isPreviewMode) return undefined
  return (role: 'leader' | 'member') => {
    setProfile(role === 'leader' ? demoLeader : demoMember)
    setActiveTab('dashboard')
  }
}
