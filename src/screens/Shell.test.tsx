import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../types'
import { Shell } from './Shell'

const leader: Profile = {
  id: 'leader',
  email: 'leader@example.com',
  name: '파트장',
  role: 'leader',
  is_active: true,
}

const member: Profile = {
  id: 'member',
  email: 'member@example.com',
  name: '파트원',
  role: 'member',
  is_active: true,
}

function emptyData(): AppData {
  return {
    profiles: [leader, member],
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

function renderShell(profile: Profile, leaderMode: boolean) {
  render(
    <Shell
      activeTab="dashboard"
      data={emptyData()}
      lastSyncedAt={null}
      leaderMode={leaderMode}
      message={null}
      notifications={[]}
      onMarkAllRead={vi.fn()}
      onOpenCommandPalette={vi.fn()}
      onRefresh={vi.fn()}
      onSignOut={vi.fn()}
      pendingCount={0}
      profile={profile}
      refreshing={false}
      saving={false}
      setActiveTab={vi.fn()}
      unreadReviewsCount={0}
    >
      <div>화면</div>
    </Shell>,
  )
}

describe('Shell review statistics navigation', () => {
  afterEach(cleanup)

  it('places the leader-only review statistics tab immediately after review requests', () => {
    renderShell(leader, true)
    const nav = screen.getByRole('navigation')
    const labels = within(nav)
      .getAllByRole('button')
      .map((button: HTMLElement) => button.textContent?.trim())

    const reviewsIndex = labels.findIndex((label: string | undefined) => label?.startsWith('검토요청'))
    const statsIndex = labels.indexOf('검토 통계')
    expect(reviewsIndex).toBeGreaterThanOrEqual(0)
    expect(statsIndex).toBe(reviewsIndex + 1)
  })

  it('does not show review statistics in member navigation', () => {
    renderShell(member, false)
    expect(screen.queryByRole('button', { name: '검토 통계' })).not.toBeInTheDocument()
  })
})
