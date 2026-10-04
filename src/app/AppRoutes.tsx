import { trackRouteLoad } from '../app/routeLoading'
import { lazy, Suspense, type ComponentType, type LazyExoticComponent } from 'react'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { canViewTeamData } from '../domain/permissions'
import type { HomeMode } from '../lib/homeMode'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId } from './types'

const loadLeaderAdminPanels = trackRouteLoad(['team', 'products', 'duties', 'invites', 'activity'], () => import('../screens/LeaderAdminPanels'))
const loadReviewPanels = trackRouteLoad(['reviews', 'review-stats'], () => import('../screens/ReviewPanels'))
const loadDashboardPanels = trackRouteLoad(['dashboard'], () => import('../screens/DashboardPanels'))

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
const loadAnnouncementsPanel = trackRouteLoad(['announcements'], () => import('../screens/AnnouncementsPanel'))
const AnnouncementsPanel = lazyNamed(loadAnnouncementsPanel, 'AnnouncementsPanel')
const loadChangeApplicationsPanel = trackRouteLoad(['change-applications'], () => import('../screens/ChangeApplicationsPanel'))
const ChangeApplicationsPanel = lazyNamed(loadChangeApplicationsPanel, 'ChangeApplicationsPanel')
const Dashboard = lazyNamed(loadDashboardPanels, 'Dashboard')
const LeaderDashboard = lazyNamed(loadDashboardPanels, 'LeaderDashboard')
const OfficeHome = lazyNamed(loadDashboardPanels, 'OfficeHome')
const MasterPanel = lazyNamed(loadLeaderAdminPanels, 'MasterPanel')
const loadMyWorkPanel = trackRouteLoad(['work'], () => import('../screens/MyWorkPanel'))
const MyWorkPanel = lazyNamed(loadMyWorkPanel, 'MyWorkPanel')
const loadProjectsPanel = trackRouteLoad(['projects'], () => import('../screens/ProjectsPanel'))
const ProjectsPanel = lazyNamed(loadProjectsPanel, 'ProjectsPanel')
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
  /** 홈 화면 방식(전체 화면 사무실 / 기존 화면) */
  homeMode?: HomeMode
  onHomeModeChange?: (mode: HomeMode) => void
  /** 상태 창을 연다(사무실 홈 ‘오늘 할 일’ 창·파트원 화면). 사람을 비우면 내 상태다. 상태가 없는 사람에게는 넘기지 않는다. */
  onOpenPresence?: (profileId?: string) => void
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
  homeMode = 'classic',
  onHomeModeChange,
  onOpenPresence,
}: AppRoutesProps) {
  const findInOffice = (id: string) => { onHomeModeChange?.('office'); setActiveTab('dashboard', id) }
  const enterOfficeMode = onHomeModeChange ? () => onHomeModeChange('office') : undefined
  const leaderMode = profile.is_active !== false && canViewTeamData(profile)

  return (
    <ErrorBoundary key={activeTab} role={leaderMode ? 'leader' : 'member'}>
      <Suspense fallback={<div className="route-loading" role="status">화면을 불러오고 있어요.</div>}>
        {activeTab === 'dashboard' && homeMode === 'office' && (
          <OfficeHome entityId={navEntityId}
            data={data}
            leaderMode={leaderMode}
            mutate={mutate}
            onOpenPresence={onOpenPresence ? () => onOpenPresence() : undefined}
            profile={profile}
            setActiveTab={setActiveTab}
            setData={setData}
          />
        )}
        {activeTab === 'dashboard' && homeMode !== 'office' &&
          (leaderMode ? (
            <LeaderDashboard
              profile={profile}
              data={data}
              setActiveTab={setActiveTab}
              mutate={mutate}
              setData={setData}
              onEnterOfficeMode={enterOfficeMode}
            />
          ) : (
            <Dashboard
              profile={profile}
              data={data}
              setActiveTab={setActiveTab}
              mutate={mutate}
              setData={setData}
              onEnterOfficeMode={enterOfficeMode}
            />
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
        {activeTab === 'review-stats' && leaderMode && <ReviewStatsPanel data={data} profile={profile} />}
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
          <ProjectsPanel onFindInOffice={findInOffice}
            profile={profile}
            data={data}
            mutate={mutate}
            setData={setData}
            initialSelectedId={navEntityId}
            onInitialSelectionApplied={() => setNavEntityId(null)}
          />
        )}
        {activeTab === 'team' && leaderMode && (
          <TeamPanel onFindInOffice={findInOffice}
            profile={profile}
            data={data}
            mutate={mutate}
            setData={setData}
            setActiveTab={setActiveTab}
            initialSelectedId={navEntityId}
            onInitialSelectionApplied={() => setNavEntityId(null)}
            onOpenPresence={profile.role === 'leader' ? onOpenPresence : undefined}
          />
        )}
        {(activeTab === 'products' || activeTab === 'duties' || activeTab === 'invites') && leaderMode && (
          <MasterPanel profile={profile} data={data} mutate={mutate} setData={setData} masterView={activeTab} />
        )}
        {activeTab === 'activity' && leaderMode && <ActivityPanel data={data} profile={profile} />}
      </Suspense>
    </ErrorBoundary>
  )
}
