import { canManageTeamData } from '../domain/permissions'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId } from './types'
import {
  ActivityPanel,
  AnnouncementsPanel,
  ChangeApplicationsPanel,
  Dashboard,
  LeaderDashboard,
  MasterPanel,
  MyWorkPanel,
  ProjectsPanel,
  ReviewStatsPanel,
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
}: AppRoutesProps) {
  const leaderMode = profile.is_active !== false && canManageTeamData(profile)

  return (
    <>
      {activeTab === 'dashboard' &&
        (leaderMode ? (
          <LeaderDashboard profile={profile} data={data} setActiveTab={setActiveTab} />
        ) : (
          <Dashboard profile={profile} data={data} setActiveTab={setActiveTab} />
        ))}
      {activeTab === 'announcements' && (
        <AnnouncementsPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          initialSelectedId={navEntityId}
          onInitialSelectionApplied={() => setNavEntityId(null)}
        />
      )}
      {activeTab === 'work' && !leaderMode && <MyWorkPanel profile={profile} data={data} />}
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
      {activeTab === 'review-stats' && leaderMode && <ReviewStatsPanel data={data} />}
      {activeTab === 'change-applications' && (
        <ChangeApplicationsPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          initialSelectedId={navEntityId}
          onInitialSelectionApplied={() => setNavEntityId(null)}
        />
      )}
      {activeTab === 'projects' && (
        <ProjectsPanel
          profile={profile}
          data={data}
          mutate={mutate}
          setData={setData}
          initialSelectedId={navEntityId}
          onInitialSelectionApplied={() => setNavEntityId(null)}
        />
      )}
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
        <MasterPanel profile={profile} data={data} mutate={mutate} setData={setData} masterView={activeTab} />
      )}
      {activeTab === 'activity' && leaderMode && <ActivityPanel data={data} />}
    </>
  )
}
