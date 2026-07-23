import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../types'
import { AppRoutes } from './AppRoutes'

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
  activeTab: 'review-stats' | 'announcements' | 'change-applications' = 'review-stats',
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
