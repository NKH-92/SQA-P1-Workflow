import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { canViewTeamData } from '../domain/permissions'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId } from './types'

const loadLeaderAdminPanels = () => import('../screens/LeaderAdminPanels')
const loadReviewPanels = () => import('../screens/ReviewPanels')
const loadDashboardPanels = () => import('../screens/DashboardPanels')

type NamedComponent<TModule, TName extends keyof TModule> = TModule[TName] extends ComponentType<infer TProps>
  ? ComponentType<TProps>
  : never

function lazyNamed<TModule, TName extends keyof TModule>(
  load: () => Promise<TModule>,
  name: TName,
) {
  const component = lazy(() => load().then((module) => ({
    default: module[name] as unknown as ComponentType<unknown>,
  })))
  return component as unknown as LazyExoticComponent<NamedComponent<TModule, TName>>
}

const ActivityPanel = lazyNamed(loadLeaderAdminPanels, 'ActivityPanel')
const AnnouncementsPanel = lazyNamed(() => import('../screens/AnnouncementsPanel'), 'AnnouncementsPanel')
const ChangeApplicationsPanel = lazyNamed(() => import('../screens/ChangeApplicationsPanel'), 'ChangeApplicationsPanel')
const Dashboard = lazyNamed(loadDashboardPanels, 'Dashboard')
const LeaderDashboard = lazyNamed(loadDashboardPanels, 'LeaderDashboard')
const MasterPanel = lazyNamed(loadLeaderAdminPanels, 'MasterPanel')
const MyWorkPanel = lazyNamed(() => import('../screens/MyWorkPanel'), 'MyWorkPanel')
const ProjectsPanel = lazyNamed(() => import('../screens/ProjectsPanel'), 'ProjectsPanel')
const ReviewStatsPanel = lazyNamed(loadReviewPanels, 'ReviewStatsPanel')
const ReviewsPanel = lazyNamed(loadReviewPanels, 'ReviewsPanel')
const TeamPanel = lazyNamed(loadLeaderAdminPanels, 'TeamPanel')

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
  const leaderMode = profile.is_active !== false && canViewTeamData(profile)

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
