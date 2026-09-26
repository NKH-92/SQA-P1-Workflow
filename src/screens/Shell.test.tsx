import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
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

const teamLeader: Profile = {
  id: 'team-leader',
  email: 'team-leader@example.com',
  name: '팀장',
  role: 'team_leader',
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

type RenderOptions = {
  activeTab?: TabId
  data?: AppData
  syncHealth?: SyncHealth
  dataWarnings?: string[]
  pendingCount?: number
  unreadReviewsCount?: number
  setActiveTab?: (tab: TabId, entityId?: string, options?: { replace?: boolean }) => void
  onPreviewRoleChange?: (role: Profile['role']) => void
  onSignOut?: () => void
  onRefresh?: () => void
  children?: ReactNode
}

function shellElement(profile: Profile, leaderMode: boolean, options: RenderOptions = {}) {
  return (
    <Shell
      activeTab={options.activeTab ?? 'dashboard'}
      data={options.data ?? emptyData()}
      dataWarnings={options.dataWarnings ?? []}
      lastSyncedAt={null}
      leaderMode={leaderMode}
      toasts={[]}
      notifications={[]}
      onMarkAllRead={vi.fn()}
      onOpenCommandPalette={vi.fn()}
      onPreviewRoleChange={options.onPreviewRoleChange}
      onRefresh={options.onRefresh ?? vi.fn()}
      onSignOut={options.onSignOut ?? vi.fn()}
      pendingCount={options.pendingCount ?? 0}
      profile={profile}
      refreshing={false}
      saving={false}
      setActiveTab={options.setActiveTab ?? vi.fn()}
      syncHealth={options.syncHealth ?? initialSyncHealth}
      unreadReviewsCount={options.unreadReviewsCount ?? 0}
    >
      {options.children ?? <div>화면</div>}
    </Shell>
  )
}

function renderShell(profile: Profile, leaderMode: boolean, options: RenderOptions = {}) {
  return render(shellElement(profile, leaderMode, options))
}

function sidebarNav() {
  return screen.getByRole('navigation', { name: '주 메뉴 항목' })
}

function stubMobileViewport() {
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({
    matches: true,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })))
}

describe('Shell review statistics navigation', () => {
  afterEach(cleanup)

  it('places the leader-only review statistics tab immediately after review requests', () => {
    renderShell(leader, true)
    const labels = within(sidebarNav())
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

describe('Shell navigation badges', () => {
  afterEach(cleanup)

  it('shows one number for pending reviews and a dot for unread news', () => {
    renderShell(leader, true, { pendingCount: 18, unreadReviewsCount: 2 })

    const reviews = within(sidebarNav()).getByRole('button', { name: '검토요청, 대기 18건, 새 소식 2건' })
    expect(within(reviews).getByText('18')).toHaveClass('nav-badge')
    const dot = reviews.querySelector('.nav-unread-badge')
    expect(dot).toBeInTheDocument()
    expect(dot).toHaveTextContent('')
  })

  it('does not badge totals such as notices, projects or members', () => {
    const data = emptyData()
    data.announcements = [{ id: 'notice-1' }, { id: 'notice-2' }] as AppData['announcements']
    data.projects = [{ id: 'project-1' }] as AppData['projects']
    renderShell(leader, true, { data })

    const nav = sidebarNav()
    expect(within(nav).getByRole('button', { name: '공지' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: '프로젝트' })).toBeInTheDocument()
    expect(within(nav).getByRole('button', { name: '파트원' })).toBeInTheDocument()
    expect(nav.querySelectorAll('.nav-badge')).toHaveLength(0)
  })

  it('shows no action badges and a read-only chip to a team leader', () => {
    renderShell(teamLeader, true, { pendingCount: 4, unreadReviewsCount: 1 })

    expect(sidebarNav().querySelectorAll('.nav-badge, .nav-dot')).toHaveLength(0)
    const topbar = document.querySelector('.topbar') as HTMLElement
    expect(within(topbar).getByText('읽기 전용')).toBeInTheDocument()
  })
})

describe('Shell skip navigation', () => {
  afterEach(() => {
    cleanup()
    window.history.replaceState(null, '', '#/dashboard')
  })

  it('focuses main content without replacing the current hash route', () => {
    window.history.replaceState(null, '', '#/reviews?id=review-1')
    renderShell(leader, true, { activeTab: 'reviews' })

    fireEvent.click(screen.getByRole('link', { name: '본문으로 건너뛰기' }))

    expect(window.location.hash).toBe('#/reviews?id=review-1')
    expect(document.getElementById('main-content')).toHaveFocus()
  })
})

describe('Shell mobile navigation', () => {
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it('makes a closed drawer inert and restores focus after Escape', async () => {
    stubMobileViewport()

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

  it('moves focus out of the drawer and replaces the drawer history entry when navigating', async () => {
    stubMobileViewport()
    const setActiveTab = vi.fn()

    renderShell(leader, true, { setActiveTab })
    const menuButton = screen.getByRole('button', { name: '메뉴 열기' })
    const sidebar = screen.getByLabelText('주 메뉴')
    await waitFor(() => expect(sidebar).toHaveAttribute('inert'))

    fireEvent.click(menuButton)
    fireEvent.click(within(sidebar).getByRole('button', { name: '공지' }))

    // 서랍을 열 때 쌓은 뒤로가기 기록을 새 화면으로 바꿔 쓴다(뒤로가기 한 번이면 이전 화면).
    expect(setActiveTab).toHaveBeenCalledWith('announcements', undefined, { replace: true })
    await waitFor(() => {
      expect(sidebar).toHaveAttribute('inert')
      expect(sidebar).toHaveAttribute('aria-hidden', 'true')
      expect(sidebar.contains(document.activeElement)).toBe(false)
      expect(menuButton).toHaveFocus()
    })
  })

  it('renders a bottom tab bar with three frequent screens and the full menu', () => {
    const setActiveTab = vi.fn()
    renderShell(member, false, { activeTab: 'reviews', setActiveTab })

    const tabBar = screen.getByRole('navigation', { name: '주요 메뉴 바로가기' })
    const links = within(tabBar).getAllByRole('link')
    expect(links.map((link) => link.textContent?.trim())).toEqual(['홈', '검토요청', '변경 적용'])
    expect(within(tabBar).getByRole('link', { name: '검토요청' })).toHaveAttribute('aria-current', 'page')
    expect(within(tabBar).getByRole('link', { name: '홈' })).toHaveAttribute('href', '#/dashboard')

    fireEvent.click(within(tabBar).getByRole('link', { name: '변경 적용' }))
    expect(setActiveTab).toHaveBeenCalledWith('change-applications')

    const fullMenu = within(tabBar).getByRole('button', { name: '전체 메뉴' })
    fireEvent.click(fullMenu)
    expect(fullMenu).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('navigation', { name: '주요 메뉴 바로가기' })).not.toBeInTheDocument()
  })

  it('names tab bar badges only for actionable counts', () => {
    const data = emptyData()
    data.changeApplications = [{ id: 'change-1', status: 'published' }] as AppData['changeApplications']
    data.changeActionItems = [{ id: 'action-1', change_application_id: 'change-1', due_date: '2026-10-01' }] as AppData['changeActionItems']
    data.productChangeTasks = [
      { id: 'task-1', action_item_id: 'action-1', status: 'pending', assignee_id: member.id },
    ] as AppData['productChangeTasks']
    renderShell(member, false, { data, unreadReviewsCount: 1 })

    const tabBar = screen.getByRole('navigation', { name: '주요 메뉴 바로가기' })
    expect(within(tabBar).getByRole('link', { name: '변경 적용, 미적용 1건' })).toBeInTheDocument()
    expect(within(tabBar).getByRole('link', { name: '검토요청, 새 소식 1건' })).toBeInTheDocument()
  })
})

describe('Shell notification disclosure', () => {
  afterEach(cleanup)

  it('owns expanded state on the bell and restores focus there after Escape', async () => {
    renderShell(leader, true)
    const densityButton = screen.getByRole('button', { name: '촘촘하게 보기' })
    const notificationButton = screen.getByRole('button', { name: '알림' })

    expect(densityButton).not.toHaveAttribute('aria-expanded')
    expect(densityButton).not.toHaveAttribute('aria-haspopup')
    expect(notificationButton).toHaveAttribute('aria-expanded', 'false')
    expect(notificationButton).toHaveAttribute('aria-haspopup', 'dialog')

    fireEvent.click(notificationButton)
    expect(notificationButton).toHaveAttribute('aria-expanded', 'true')
    // 알림 패널은 지연 로딩한다.
    expect(await screen.findByRole('dialog', { name: '알림' })).toBeInTheDocument()
    expect(screen.getByText('새 알림이 없어요')).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => {
      expect(notificationButton).toHaveAttribute('aria-expanded', 'false')
      expect(notificationButton).toHaveFocus()
    })
  })
})

describe('Shell profile area', () => {
  afterEach(cleanup)

  it('keeps density and sign-out in the profile area instead of the top bar', () => {
    const onSignOut = vi.fn()
    renderShell(leader, true, { onSignOut })
    const topbar = document.querySelector('.topbar') as HTMLElement
    const footer = document.querySelector('.sidebar-footer') as HTMLElement

    expect(within(topbar).queryByRole('button', { name: '로그아웃' })).not.toBeInTheDocument()
    expect(within(topbar).queryByRole('button', { name: '촘촘하게 보기' })).not.toBeInTheDocument()
    expect(within(topbar).getByRole('button', { name: '새로고침' })).toBeInTheDocument()

    const density = within(footer).getByRole('button', { name: '촘촘하게 보기' })
    expect(density).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(density)
    expect(density).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(density)

    fireEvent.click(within(footer).getByRole('button', { name: '로그아웃' }))
    expect(onSignOut).toHaveBeenCalledTimes(1)
  })

  it('offers the read-only team leader in the preview role switch without renaming existing roles', () => {
    const onPreviewRoleChange = vi.fn()
    renderShell(leader, true, { onPreviewRoleChange })

    const roles = screen.getByRole('group', { name: '미리보기 역할' })
    expect(within(roles).getAllByRole('button').map((button) => button.textContent)).toEqual(['파트장', '팀장', '파트원'])
    expect(within(roles).getByRole('button', { name: '파트장' })).toHaveAttribute('aria-pressed', 'true')

    fireEvent.click(within(roles).getByRole('button', { name: '팀장' }))
    expect(onPreviewRoleChange).toHaveBeenCalledWith('team_leader')
  })
})

describe('Shell announcements navigation', () => {
  afterEach(cleanup)

  it.each([
    { profile: leader, leaderMode: true },
    { profile: member, leaderMode: false },
  ])('shows the shared announcements tab for $profile.role', ({ profile, leaderMode }) => {
    renderShell(profile, leaderMode)
    expect(within(sidebarNav()).getByRole('button', { name: '공지' })).toBeInTheDocument()
  })
})

describe('Shell navigation metadata parity', () => {
  afterEach(cleanup)

  it('preserves every leader section, sidebar label, and order without total-count badges', () => {
    renderShell(leader, true)
    const groups = [...sidebarNav().querySelectorAll('.nav-group')].map((group) => ({
      label: group.querySelector('.nav-group-label')?.textContent,
      items: [...group.querySelectorAll('.nav-item')].map((item) => item.textContent?.trim()),
    }))

    expect(groups).toEqual([
      {
        label: '워크스페이스',
        items: ['홈', '공지', '검토요청', '검토 통계', '변경 적용', '프로젝트', '파트원', '활동 로그'],
      },
      {
        label: '마스터',
        items: ['제품', '업무 카테고리', '계정 관리'],
      },
    ])
  })

  it('preserves every member sidebar label and order', () => {
    renderShell(member, false)
    const nav = sidebarNav()
    const group = nav.querySelector('.nav-group')

    expect(group?.querySelector('.nav-group-label')).toHaveTextContent('내 업무')
    expect([...nav.querySelectorAll('.nav-item')].map((item) => item.textContent?.trim())).toEqual([
      '홈',
      '공지',
      '내 검토요청',
      '변경 적용',
      '내 프로젝트',
      '내 담당',
    ])
  })

  it('shows the location in the top bar without making it a second h1', () => {
    renderShell(leader, true, { activeTab: 'products' })
    expect(document.querySelector('.topbar h1')).toBeNull()
    expect(document.querySelector('.topbar-title')).toHaveTextContent('마스터 / 제품')
    expect(within(sidebarNav()).getByRole('button', { name: '제품' })).toBeInTheDocument()
    cleanup()

    renderShell(member, false, { activeTab: 'announcements' })
    expect(document.querySelector('.topbar-title')).toHaveTextContent('내 업무 / 공지')
  })
})

describe('Shell route context', () => {
  afterEach(cleanup)

  it('names the browser tab after the current screen', () => {
    const { rerender } = renderShell(leader, true, { activeTab: 'reviews' })
    expect(document.title).toBe('검토요청 · SQA P1')

    rerender(shellElement(member, false, { activeTab: 'reviews' }))
    expect(document.title).toBe('내 검토요청 · SQA P1')
  })

  it('moves focus to the new page heading after desktop navigation', async () => {
    const setActiveTab = vi.fn()
    const { rerender } = renderShell(leader, true, {
      setActiveTab,
      children: <div className="stack"><h1>오늘 처리할 일이 없어요</h1></div>,
    })

    fireEvent.click(within(sidebarNav()).getByRole('button', { name: '공지' }))
    expect(setActiveTab).toHaveBeenCalledWith('announcements', undefined, undefined)

    rerender(shellElement(leader, true, {
      activeTab: 'announcements',
      setActiveTab,
      children: <div className="stack"><h1>공지 게시판</h1></div>,
    }))

    const heading = screen.getByRole('heading', { level: 1, name: '공지 게시판' })
    await waitFor(() => expect(heading).toHaveFocus())
    expect(heading).toHaveAttribute('tabindex', '-1')
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

    const warning = screen.getByText('연결 지연')
    expect(warning.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite')
  })

  it.each([
    {
      code: 'network',
      label: '연결 지연',
      guidance: '네트워크를 확인하고 다시 시도해 주세요.',
    },
    {
      code: 'SQA_BOOTSTRAP_SCHEMA_MISMATCH',
      label: '업데이트 필요',
      guidance: '앱이 최신 버전이 아니에요.',
    },
    {
      code: '42501',
      label: '권한 확인 필요',
      guidance: '데이터를 볼 권한을 확인하지 못했어요.',
    },
    {
      code: 'PGRST301',
      label: '권한 확인 필요',
      guidance: '데이터를 볼 권한을 확인하지 못했어요.',
    },
    {
      code: 'unexpected-private-code',
      label: '동기화 지연',
      guidance: '최신 데이터를 불러오지 못했어요.',
    },
    {
      code: null,
      label: '동기화 지연',
      guidance: '최신 데이터를 불러오지 못했어요.',
    },
  ])('shows safe $label guidance for $code without exposing the code', ({ code, label, guidance }) => {
    const staleHealth: SyncHealth = {
      consecutiveFailures: 3,
      lastSuccessAt: null,
      lastFailureAt: new Date('2026-07-20T00:10:00.000Z'),
      stale: true,
      lastErrorCode: code,
    }
    renderShell(leader, true, { syncHealth: staleHealth })

    const warning = screen.getByText(label).closest('button')
    expect(warning).toHaveAttribute('title', expect.stringContaining(guidance))
    expect(warning).toHaveAttribute('title', expect.stringContaining('3번 연속으로 실패했어요'))
    if (code) expect(warning?.getAttribute('title')).not.toContain(code)
  })

  it('explains a stale sync on tap and offers a retry', () => {
    const onRefresh = vi.fn()
    const staleHealth: SyncHealth = {
      consecutiveFailures: 2,
      lastSuccessAt: null,
      lastFailureAt: new Date('2026-07-20T00:10:00.000Z'),
      stale: true,
      lastErrorCode: 'network',
    }
    renderShell(leader, true, { syncHealth: staleHealth, onRefresh })

    const trigger = screen.getByRole('button', { name: '연결 지연' })
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/서버 연결이 불안정해요/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(onRefresh).toHaveBeenCalledTimes(1)
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
      dataWarnings: ['공지: 새로 불러오지 못해 이전 내용을 보여 주고 있어요.'],
    })

    expect(screen.getByText('일부 데이터를 새로 불러오지 못했어요.')).toBeInTheDocument()
    expect(screen.getByText(/공지: 새로 불러오지 못해/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
  })
})
