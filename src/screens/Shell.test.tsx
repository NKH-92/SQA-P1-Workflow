import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { TabId } from '../app/types'
import type { AppData, Profile } from '../types'
import { initialSyncHealth, type SyncHealth } from '../app/hooks/useSyncHealth'
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
  options: {
    activeTab?: TabId
    data?: AppData
    syncHealth?: SyncHealth
    dataWarnings?: string[]
    pendingCount?: number
    unreadReviewsCount?: number
  } = {},
) {
  return render(
    <Shell
      activeTab={options.activeTab ?? 'dashboard'}
      data={options.data ?? emptyData()}
      dataWarnings={options.dataWarnings ?? []}
      lastSyncedAt={null}
      leaderMode={leaderMode}
      message={null}
      notifications={[]}
      onMarkAllRead={vi.fn()}
      onOpenCommandPalette={vi.fn()}
      onRefresh={vi.fn()}
      onSignOut={vi.fn()}
      pendingCount={options.pendingCount ?? 0}
      profile={profile}
      refreshing={false}
      saving={false}
      setActiveTab={vi.fn()}
      syncHealth={options.syncHealth ?? initialSyncHealth}
      unreadReviewsCount={options.unreadReviewsCount ?? 0}
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

describe('Shell review count semantics', () => {
  afterEach(cleanup)

  it('exposes pending and unread counts independently', () => {
    renderShell(leader, true, { pendingCount: 18, unreadReviewsCount: 2 })

    const reviews = screen.getByRole('button', { name: '검토요청, 대기 18건, 새 알림 2건' })
    expect(within(reviews).getByText('18')).toHaveClass('nav-badge')
    expect(within(reviews).getByText('2')).toHaveClass('nav-unread-badge')
  })
})

describe('Shell mobile navigation', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('makes a closed drawer inert and restores focus after Escape', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(max-width: 1080px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))

    renderShell(leader, true)
    const menuButton = screen.getByRole('button', { name: '메뉴 열기' })
    const sidebar = screen.getByLabelText('주 메뉴')
    await waitFor(() => expect(sidebar).toHaveAttribute('inert'))

    fireEvent.click(menuButton)
    expect(menuButton).toHaveAttribute('aria-expanded', 'true')
    expect(sidebar).not.toHaveAttribute('inert')

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(menuButton).toHaveAttribute('aria-expanded', 'false')
      expect(sidebar).toHaveAttribute('inert')
      expect(menuButton).toHaveFocus()
    })
  })

  it('moves focus out of the drawer before a mobile navigation selection becomes inert', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(max-width: 1080px)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })))

    renderShell(leader, true)
    const menuButton = screen.getByRole('button', { name: '메뉴 열기' })
    const sidebar = screen.getByLabelText('주 메뉴')
    await waitFor(() => expect(sidebar).toHaveAttribute('inert'))

    fireEvent.click(menuButton)
    fireEvent.click(within(sidebar).getByRole('button', { name: '공지0' }))

    await waitFor(() => {
      expect(sidebar).toHaveAttribute('inert')
      expect(sidebar).toHaveAttribute('aria-hidden', 'true')
      expect(sidebar.contains(document.activeElement)).toBe(false)
      expect(menuButton).toHaveFocus()
    })
  })
})

describe('Shell notification disclosure', () => {
  afterEach(cleanup)

  it('owns expanded state on the bell and restores focus there after Escape', async () => {
    renderShell(leader, true)
    const densityButton = screen.getByRole('button', { name: '간격 압축해서 보기' })
    const notificationButton = screen.getByRole('button', { name: '알림' })

    expect(densityButton).not.toHaveAttribute('aria-expanded')
    expect(densityButton).not.toHaveAttribute('aria-haspopup')
    expect(notificationButton).toHaveAttribute('aria-expanded', 'false')
    expect(notificationButton).toHaveAttribute('aria-haspopup', 'dialog')

    fireEvent.click(notificationButton)
    expect(notificationButton).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('dialog', { name: '알림' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(notificationButton).toHaveAttribute('aria-expanded', 'false')
      expect(notificationButton).toHaveFocus()
    })
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

describe('Shell sync health warning', () => {
  afterEach(cleanup)

  it('shows no persistent warning while sync health is healthy', () => {
    renderShell(leader, true)
    expect(screen.queryByText('동기화 지연')).not.toBeInTheDocument()
  })

  it('shows a persistent topbar warning once sync health is stale', () => {
    const staleHealth: SyncHealth = {
      consecutiveFailures: 2,
      lastSuccessAt: new Date('2026-07-20T00:00:00.000Z'),
      lastFailureAt: new Date('2026-07-20T00:10:00.000Z'),
      stale: true,
      lastErrorCode: 'network',
    }
    renderShell(leader, true, { syncHealth: staleHealth })

    const warning = screen.getByText('동기화 지연')
    expect(warning.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite')
  })

  it('never renders raw error detail text, only the safe error code, inside the warning title', () => {
    const staleHealth: SyncHealth = {
      consecutiveFailures: 3,
      lastSuccessAt: null,
      lastFailureAt: new Date('2026-07-20T00:10:00.000Z'),
      stale: true,
      lastErrorCode: 'network',
    }
    renderShell(leader, true, { syncHealth: staleHealth })

    const warning = screen.getByText('동기화 지연').closest('[role="status"]')
    expect(warning).toHaveAttribute('title', expect.stringContaining('network'))
    expect(warning?.getAttribute('title')).not.toMatch(/@|review|body/i)
  })

  it('does not show the warning for a single background failure that is not yet stale', () => {
    const oneFailure: SyncHealth = {
      consecutiveFailures: 1,
      lastSuccessAt: new Date(),
      lastFailureAt: new Date(),
      stale: false,
      lastErrorCode: 'network',
    }
    renderShell(leader, true, { syncHealth: oneFailure })
    expect(screen.queryByText('동기화 지연')).not.toBeInTheDocument()
  })

  it('keeps optional-data warnings visible with an explicit retry action', () => {
    renderShell(leader, true, {
      dataWarnings: ['공지 조회에 실패해 마지막 정상 데이터를 유지합니다.'],
    })

    expect(screen.getByText('일부 데이터가 최신이 아닙니다.')).toBeInTheDocument()
    expect(screen.getByText(/공지 조회에 실패/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
