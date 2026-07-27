import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../types'
import { AppRoutes } from './AppRoutes'
import type { TabId } from './types'

vi.mock('../screens/ActivityPanel', () => ({
  ActivityPanel: () => <div data-testid="activity-screen">activity</div>,
}))

vi.mock('../screens/AnnouncementsPanel', () => ({
  AnnouncementsPanel: ({ initialSelectedId }: { initialSelectedId?: string | null }) => (
    <div data-testid="announcements-screen">{initialSelectedId ?? 'announcement-list'}</div>
  ),
}))
vi.mock('../screens/ChangeApplicationsPanel', () => ({
  ChangeApplicationsPanel: ({ initialSelectedId }: { initialSelectedId?: string | null }) => (
    <div data-testid="change-applications-screen">{initialSelectedId ?? 'change-list'}</div>
  ),
}))
vi.mock('../screens/ReviewStatsPanel', () => ({
  ReviewStatsPanel: () => <div data-testid="review-stats-screen">검토 통계 화면</div>,
}))
vi.mock('../screens/MasterPanel', () => ({
  MasterPanel: ({ masterView }: { masterView: string }) => (
    <div data-testid="master-screen">{masterView}</div>
  ),
}))
vi.mock('../screens/TeamPanel', () => ({
  TeamPanel: () => <div data-testid="team-screen">team</div>,
}))

function emptyData(): AppData {
  return {
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [],
    allowedUsers: [],
    products: [],
    dutyMajorCategories: [],
    duties: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
}

function renderRoute(
  profile: Profile,
  activeTab: TabId = 'review-stats',
  navEntityId: string | null = null,
) {
  render(
    <AppRoutes
      activeTab={activeTab}
      data={emptyData()}
      mutate={vi.fn(async () => true)}
      navEntityId={navEntityId}
      profile={profile}
      setActiveTab={vi.fn()}
      setData={vi.fn()}
      setNavEntityId={vi.fn()}
    />,
  )
}

describe('AppRoutes review statistics guard', () => {
  afterEach(cleanup)

  it('renders review statistics for an active leader', async () => {
    renderRoute({ id: 'leader', email: 'leader@example.com', name: '파트장', role: 'leader', is_active: true })

    expect(screen.getByRole('status')).toHaveClass('route-loading')
    expect(await screen.findByTestId('review-stats-screen')).toBeInTheDocument()
  })

  it('does not render review statistics for a member', () => {
    renderRoute({ id: 'member', email: 'member@example.com', name: '파트원', role: 'member', is_active: true })
    expect(screen.queryByTestId('review-stats-screen')).not.toBeInTheDocument()
  })

  it('does not render review statistics for an inactive leader', () => {
    renderRoute({ id: 'inactive', email: 'inactive@example.com', name: '비활성 파트장', role: 'leader', is_active: false })
    expect(screen.queryByTestId('review-stats-screen')).not.toBeInTheDocument()
  })
})

describe('AppRoutes leader-only lazy routes', () => {
  afterEach(cleanup)

  const leaderOnlyRoutes = [
    { activeTab: 'review-stats', testId: 'review-stats-screen', content: '검토 통계 화면' },
    { activeTab: 'team', testId: 'team-screen', content: 'team' },
    { activeTab: 'products', testId: 'master-screen', content: 'products' },
    { activeTab: 'duties', testId: 'master-screen', content: 'duties' },
    { activeTab: 'invites', testId: 'master-screen', content: 'invites' },
    { activeTab: 'activity', testId: 'activity-screen', content: 'activity' },
  ] as const satisfies ReadonlyArray<{
    activeTab: TabId
    testId: string
    content: string
  }>

  it.each(leaderOnlyRoutes)('renders $activeTab for an active leader', async ({ activeTab, testId, content }) => {
    renderRoute(
      { id: 'leader', email: 'leader@example.com', name: '파트장', role: 'leader', is_active: true },
      activeTab,
    )

    expect(await screen.findByTestId(testId)).toHaveTextContent(content)
  })

  it.each([
    { label: 'member', profile: { id: 'member', email: 'member@example.com', name: '파트원', role: 'member', is_active: true } },
    { label: 'inactive leader', profile: { id: 'inactive', email: 'inactive@example.com', name: '비활성 파트장', role: 'leader', is_active: false } },
  ] as const)('gates every leader-only lazy route for an unauthorized $label', ({ profile }) => {
    for (const { activeTab, testId } of leaderOnlyRoutes) {
      const { unmount } = render(
        <AppRoutes
          activeTab={activeTab}
          data={emptyData()}
          mutate={vi.fn(async () => true)}
          navEntityId={null}
          profile={profile}
          setActiveTab={vi.fn()}
          setData={vi.fn()}
          setNavEntityId={vi.fn()}
        />,
      )

      expect(screen.queryByTestId(testId)).not.toBeInTheDocument()
      expect(screen.queryByRole('status')).not.toBeInTheDocument()
      unmount()
    }
  })
})

describe('AppRoutes announcements route', () => {
  afterEach(cleanup)

  it.each([
    { id: 'leader', role: 'leader' as const },
    { id: 'member', role: 'member' as const },
  ])('renders announcements for an active $role', async ({ id, role }) => {
    renderRoute(
      { id, email: `${id}@example.com`, name: id, role, is_active: true },
      'announcements',
      'notice-1',
    )

    expect(await screen.findByTestId('announcements-screen')).toHaveTextContent('notice-1')
  })
})

describe('AppRoutes change applications route', () => {
  afterEach(cleanup)

  it.each([
    { id: 'leader', role: 'leader' as const },
    { id: 'member', role: 'member' as const },
  ])('renders change applications for an active $role', async ({ id, role }) => {
    renderRoute(
      { id, email: `${id}@example.com`, name: id, role, is_active: true },
      'change-applications',
      'change-1',
    )

    expect(await screen.findByTestId('change-applications-screen')).toHaveTextContent('change-1')
  })
})
