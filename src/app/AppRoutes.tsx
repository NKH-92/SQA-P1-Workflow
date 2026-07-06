import { previewLeader as demoLeader, previewMember as demoMember } from '../demoData'
import { canManageTeamData } from '../domain/permissions'
import { isPreviewMode } from '../lib/supabase'
import type { AppData, Profile } from '../types'
import type { TabId, ToastMessage } from './types'
import {
  ActivityPanel,
  Dashboard,
  LeaderDashboard,
  MasterPanel,
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
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: React.Dispatch<React.SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>
  setMessage: React.Dispatch<React.SetStateAction<ToastMessage | null>>
  refreshData: () => Promise<void>
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
}: AppRoutesProps) {
  const leaderMode = canManageTeamData(profile)

  return (
    <>
      {(activeTab === 'dashboard' || activeTab === 'work') &&
        (leaderMode && activeTab === 'dashboard' ? (
          <LeaderDashboard profile={profile} data={data} setActiveTab={setActiveTab} />
        ) : !leaderMode ? (
          <Dashboard profile={profile} data={data} mutate={mutate} setData={setData} setActiveTab={setActiveTab} />
        ) : null)}
      {activeTab === 'reviews' && (
        <ReviewsPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          initialSelectedId={navEntityId}
          onInitialSelectionApplied={() => setNavEntityId(null)}
        />
      )}
      {activeTab === 'projects' && <ProjectsPanel profile={profile} data={data} mutate={mutate} setData={setData} />}
      {activeTab === 'team' && leaderMode && (
        <TeamPanel profile={profile} data={data} mutate={mutate} setData={setData} setActiveTab={setActiveTab} />
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
