import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../types'
import { AppRoutes } from './AppRoutes'

vi.mock('../screens', () => ({
  ActivityPanel: () => null,
  Dashboard: () => null,
  LeaderDashboard: () => null,
  MasterPanel: () => null,
  MyWorkPanel: () => null,
  ProjectsPanel: () => null,
  ReviewStatsPanel: () => <div data-testid="review-stats-screen">검토 통계 화면</div>,
  ReviewsPanel: () => null,
  TeamPanel: () => null,
}))

function emptyData(): AppData {
  return {
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

function renderRoute(profile: Profile) {
  render(
    <AppRoutes
      activeTab="review-stats"
      data={emptyData()}
      mutate={vi.fn(async () => true)}
      navEntityId={null}
      profile={profile}
      reviewsUnreadCutoff={null}
      setActiveTab={vi.fn()}
      setData={vi.fn()}
      setNavEntityId={vi.fn()}
    />,
  )
}

describe('AppRoutes review statistics guard', () => {
  afterEach(cleanup)

  it('renders review statistics for an active leader', () => {
    renderRoute({ id: 'leader', email: 'leader@example.com', name: '파트장', role: 'leader', is_active: true })
    expect(screen.getByTestId('review-stats-screen')).toBeInTheDocument()
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
