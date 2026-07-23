import { lazy, Suspense } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { canManageTeamData } from '../domain/permissions'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId } from './types'

const ActivityPanel = lazy(() =>
  import('../screens/ActivityPanel').then((module) => ({ default: module.ActivityPanel })),
)
const AnnouncementsPanel = lazy(() =>
  import('../screens/AnnouncementsPanel').then((module) => ({ default: module.AnnouncementsPanel })),
)
const ChangeApplicationsPanel = lazy(() =>
  import('../screens/ChangeApplicationsPanel').then((module) => ({ default: module.ChangeApplicationsPanel })),
)
const Dashboard = lazy(() =>
  import('../screens/Dashboard').then((module) => ({ default: module.Dashboard })),
)
const LeaderDashboard = lazy(() =>
  import('../screens/LeaderDashboard').then((module) => ({ default: module.LeaderDashboard })),
)
const MasterPanel = lazy(() =>
  import('../screens/MasterPanel').then((module) => ({ default: module.MasterPanel })),
)
const MyWorkPanel = lazy(() =>
  import('../screens/MyWorkPanel').then((module) => ({ default: module.MyWorkPanel })),
)
const ProjectsPanel = lazy(() =>
  import('../screens/ProjectsPanel').then((module) => ({ default: module.ProjectsPanel })),
)
const ReviewStatsPanel = lazy(() =>
  import('../screens/ReviewStatsPanel').then((module) => ({ default: module.ReviewStatsPanel })),
)
const ReviewsPanel = lazy(() =>
  import('../screens/ReviewsPanel').then((module) => ({ default: module.ReviewsPanel })),
)
const TeamPanel = lazy(() =>
  import('../screens/TeamPanel').then((module) => ({ default: module.TeamPanel })),
)

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
    <ErrorBoundary key={activeTab} role={leaderMode ? 'leader' : 'member'}>
      <Suspense fallback={<div className="route-loading" role="status">화면을 불러오는 중입니다.</div>}>
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
      </Suspense>
    </ErrorBoundary>
  )
}
