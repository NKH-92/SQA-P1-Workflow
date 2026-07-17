import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TabId } from '../app/types'
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
    announcements: [],
    changeApplications: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
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

function renderShell(
  profile: Profile,
  leaderMode: boolean,
  options: { activeTab?: TabId; data?: AppData } = {},
) {
  return render(
    <Shell
      activeTab={options.activeTab ?? 'dashboard'}
      data={options.data ?? emptyData()}
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

describe('Shell announcements navigation', () => {
  afterEach(cleanup)

  it.each([
    { profile: leader, leaderMode: true },
    { profile: member, leaderMode: false },
  ])('shows the shared announcements tab for $profile.role', ({ profile, leaderMode }) => {
    renderShell(profile, leaderMode)
    expect(screen.getByRole('button', { name: /^공지0$/ })).toBeInTheDocument()
  })
})

describe('Shell navigation metadata parity', () => {
  afterEach(cleanup)

  it('preserves every leader section, sidebar label, count, and order', () => {
    renderShell(leader, true)
    const nav = screen.getByRole('navigation')
    const groups = [...nav.querySelectorAll('.nav-group')].map((group) => ({
      label: group.querySelector('.nav-group-label')?.textContent,
      items: [...group.querySelectorAll('.nav-item')].map((item) => item.textContent?.trim()),
    }))

    expect(groups).toEqual([
      {
        label: '워크스페이스',
        items: ['홈', '공지0', '검토요청0', '검토 통계', '변경 적용0', '프로젝트0', '파트원1', '활동 로그0'],
      },
      {
        label: '마스터',
        items: ['제품0', '업무 카테고리0', '초대 관리0'],
      },
    ])
  })

  it('preserves every member sidebar label and order', () => {
    renderShell(member, false)
    const nav = screen.getByRole('navigation')
    const group = nav.querySelector('.nav-group')

    expect(group?.querySelector('.nav-group-label')).toHaveTextContent('내 업무')
    expect([...nav.querySelectorAll('.nav-item')].map((item) => item.textContent?.trim())).toEqual([
      '홈',
      '공지0',
      '내 검토요청0',
      '변경 적용0',
      '내 프로젝트0',
      '내 담당0',
    ])
  })

  it('keeps header labels distinct from sidebar labels on each surface', () => {
    renderShell(leader, true, { activeTab: 'products' })
    expect(screen.getByRole('heading', { level: 1, name: '마스터 / 제품' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '제품0' })).toBeInTheDocument()
    cleanup()

    renderShell(member, false, { activeTab: 'announcements' })
    expect(screen.getByRole('heading', { level: 1, name: '워크스페이스 / 공지' })).toBeInTheDocument()
  })
})
