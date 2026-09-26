import { Suspense, lazy, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { Profile, Role } from '../types'
import type { TabId, ToastMessage } from '../app/types'
import type { SyncHealth } from '../app/hooks/useSyncHealth'
import { canManageTeamData } from '../domain/permissions'
import { formatClock, roleLabels } from '../lib/format'
import {
  APP_DOCUMENT_TITLE,
  buildAppHash,
  documentTitleFor,
  navigationItemsForRole,
  parseAppHash,
  tabHeaderLabel,
  tabShortLabel,
  type NavigateOptions,
} from '../lib/navigation'
import { preferredScrollBehavior } from '../lib/motion'
import type { AppNotification } from '../lib/notifications'
import type { DesktopNotificationControls } from '../app/hooks/useDesktopNotifications'
import { commandSearchPlaceholder } from '../components/commandPaletteModel'
import { ToastViewport } from '../components/ui/ToastViewport'
import { prefetchWhenIdle } from '../lib/prefetch'
import { useHistoryLayer } from '../hooks/useHistoryLayer'
import { buildShellModel, shellTabAccessibleName, type ShellFeatureData, type ShellTabState } from './shellModel'
import { useDensityPreference } from './useDensityPreference'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Briefcase,
  Check,
  ClipboardPenLine,
  FolderKanban,
  House,
  LayoutGrid,
  ListChecks,
  LogOut,
  Megaphone,
  Menu,
  MessageSquare,
  Package,
  RefreshCw,
  Rows3,
  Search,
  ShieldCheck,
  Users,
  X,
} from 'lucide-react'

function buildSyncWarning(syncHealth: SyncHealth): { label: string; title: string } {
  const failureSuffix = syncHealth.consecutiveFailures > 0
    ? ` ${syncHealth.consecutiveFailures}번 연속으로 실패했어요.`
    : ''

  switch (syncHealth.lastErrorCode) {
    case 'network':
      return {
        label: '연결 지연',
        title: `서버 연결이 불안정해요. 네트워크를 확인하고 다시 시도해 주세요.${failureSuffix}`,
      }
    case 'SQA_BOOTSTRAP_SCHEMA_MISMATCH':
      return {
        label: '업데이트 필요',
        title: `앱이 최신 버전이 아니에요. 화면을 새로고침하고, 그래도 계속되면 관리자에게 알려 주세요.${failureSuffix}`,
      }
    case '42501':
    case 'PGRST301':
      return {
        label: '권한 확인 필요',
        title: `데이터를 볼 권한을 확인하지 못했어요. 다시 로그인해도 계속되면 관리자에게 알려 주세요.${failureSuffix}`,
      }
    default:
      return {
        label: '동기화 지연',
        title: `최신 데이터를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.${failureSuffix}`,
      }
  }
}

/** 알림 패널은 종을 눌렀을 때만 필요하다. 첫 화면 번들에서 빼고 한가할 때 미리 받아 둔다. */
const loadNotificationPanel = () => import('../components/NotificationPanel')
const NotificationPanel = lazy(() => loadNotificationPanel().then((module) => ({ default: module.NotificationPanel })))

const noopDismiss = () => {}

/** 하단 탭바(640px 이하)에 두는 자주 가는 화면. 나머지는 ‘전체’로 서랍 메뉴를 연다(토스 TB-1·TB-2). */
const TAB_BAR_TABS: TabId[] = ['dashboard', 'reviews', 'change-applications']

const PREVIEW_ROLES: Array<{ role: Role; label: string }> = [
  { role: 'leader', label: '파트장' },
  { role: 'team_leader', label: '팀장' },
  { role: 'member', label: '파트원' },
]

const tabIcons: Record<TabId, React.ReactNode> = {
  dashboard: <House aria-hidden="true" size={18} />,
  announcements: <Megaphone aria-hidden="true" size={18} />,
  reviews: <Check aria-hidden="true" size={18} />,
  'review-stats': <BarChart3 aria-hidden="true" size={18} />,
  'change-applications': <ClipboardPenLine aria-hidden="true" size={18} />,
  projects: <FolderKanban aria-hidden="true" size={18} />,
  team: <Users aria-hidden="true" size={18} />,
  products: <Package aria-hidden="true" size={18} />,
  duties: <ListChecks aria-hidden="true" size={18} />,
  invites: <ShieldCheck aria-hidden="true" size={18} />,
  work: <Briefcase aria-hidden="true" size={18} />,
  activity: <MessageSquare aria-hidden="true" size={18} />,
}

function shortcutHint() {
  if (typeof navigator === 'undefined') return 'Ctrl K'
  return /Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent) ? '⌘ K' : 'Ctrl K'
}

/** 처리할 수는 숫자 하나로, 새 소식과 확인 필요 표시는 점으로 그린다. 읽는 이름은 버튼의 aria-label이 맡는다. */
function NavBadges({ state }: { state?: ShellTabState }) {
  if (!state) return null
  return (
    <>
      {state.count ? (
        <span aria-hidden="true" className="nav-badge nav-count">{state.count > 99 ? '99+' : state.count}</span>
      ) : null}
      {state.unreadCount ? <span aria-hidden="true" className="nav-unread-badge nav-dot" /> : null}
      {state.attention ? <span aria-hidden="true" className="nav-dot nav-attention-dot" /> : null}
    </>
  )
}

export function Shell({
  activeTab,
  setActiveTab,
  profile,
  data,
  leaderMode,
  toasts = [],
  saving,
  refreshing,
  lastSyncedAt,
  dataWarnings = [],
  syncHealth,
  pendingCount,
  unreadReviewsCount,
  notifications,
  desktopNotifications,
  onMarkAllRead,
  onOpenCommandPalette,
  onDismissToast,
  onRefresh,
  onSignOut,
  onPreviewRoleChange,
  children,
}: {
  activeTab: TabId
  setActiveTab: (tab: TabId, entityId?: string, options?: NavigateOptions) => void
  profile: Profile
  data: ShellFeatureData
  leaderMode: boolean
  /** 화면에 쌓인 토스트(최대 3개) */
  toasts?: ToastMessage[]
  saving: boolean
  refreshing: boolean
  lastSyncedAt: Date | null
  /** 불러오지 못한 부가 데이터 안내. 목록 표시 상한 같은 평상시 안내는 여기에 넣지 않는다. */
  dataWarnings?: string[]
  /** 백그라운드 동기화 상태 관측 — topbar persistent 경고 표시 여부를 결정한다. */
  syncHealth: SyncHealth
  pendingCount: number
  unreadReviewsCount: number
  notifications: AppNotification[]
  /** 새 검토요청을 처리할 수 있는 파트장에게만 내려온다 — 데스크톱 알림 설정 토글. */
  desktopNotifications?: DesktopNotificationControls
  onMarkAllRead: () => void
  onOpenCommandPalette: () => void
  onDismissToast?: (id: number) => void
  onRefresh: () => void
  onSignOut: () => void
  onPreviewRoleChange?: (role: Role) => void
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  useEffect(() => prefetchWhenIdle(loadNotificationPanel), [])
  const [syncDetailOpen, setSyncDetailOpen] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const [actionBarShown, setActionBarShown] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const drawerOpenerRef = useRef<HTMLElement | null>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const mainRef = useRef<HTMLElement>(null)
  const notificationButtonRef = useRef<HTMLButtonElement>(null)
  const scrollPositionsRef = useRef(new Map<TabId, number>())
  const activeTabRef = useRef(activeTab)
  const focusHeadingOnNavigateRef = useRef(false)
  const syncDetailId = useId()
  const { density, toggleDensity } = useDensityPreference()
  const canManage = canManageTeamData(profile)
  const readOnly = leaderMode && !canManage
  const { unreadNotifications, tabs } = buildShellModel({
    data,
    profile,
    leaderMode,
    canManage,
    pendingCount,
    unreadReviewsCount,
    notifications,
  })
  const navSections: Array<{
    label: string
    items: Array<{ id: TabId; label: string }>
  }> = []
  for (const item of navigationItemsForRole(leaderMode)) {
    let section = navSections[navSections.length - 1]
    if (!section || section.label !== item.section) {
      section = { label: item.section, items: [] }
      navSections.push(section)
    }
    section.items.push({ id: item.tab, label: item.sidebarLabel })
  }
  const headerLabel = tabHeaderLabel(activeTab, leaderMode)
  const syncLabel = lastSyncedAt
    ? `마지막 동기화 ${formatClock(lastSyncedAt) ?? ''}`
    : null
  const syncWarning = buildSyncWarning(syncHealth)
  const busyLabel = saving ? '저장하는 중…' : refreshing ? '새로고침 중…' : null
  const showSyncWarning = !busyLabel && syncHealth.stale

  const closeSidebar = useCallback((restoreFocus = true) => {
    setSidebarOpen(false)
    if (!restoreFocus) return
    const opener = drawerOpenerRef.current ?? menuButtonRef.current
    window.setTimeout(() => opener?.focus(), 0)
  }, [])

  const openSidebar = (opener: HTMLElement) => {
    drawerOpenerRef.current = opener
    setSidebarOpen(true)
  }

  const closeNotifications = useCallback(() => {
    setNotifOpen(false)
    window.setTimeout(() => notificationButtonRef.current?.focus(), 0)
  }, [])

  // 좁은 화면·터치 기기에서 뒤로가기를 누르면 서랍 메뉴부터 닫는다.
  useHistoryLayer(mobileSidebar && sidebarOpen, () => closeSidebar())

  useEffect(() => {
    if (!showSyncWarning) setSyncDetailOpen(false)
  }, [showSyncWarning])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(max-width: 1080px)')
    const apply = () => {
      setMobileSidebar(query.matches)
      if (!query.matches) setSidebarOpen(false)
    }
    apply()
    query.addEventListener?.('change', apply)
    return () => query.removeEventListener?.('change', apply)
  }, [])

  useEffect(() => {
    const sidebar = sidebarRef.current
    if (!sidebar) return
    if (mobileSidebar && !sidebarOpen) sidebar.setAttribute('inert', '')
    else sidebar.removeAttribute('inert')
  }, [mobileSidebar, sidebarOpen])

  useEffect(() => {
    if (!mobileSidebar || !sidebarOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const focusTimer = window.setTimeout(() => {
      sidebarRef.current?.querySelector<HTMLElement>('.nav-item')?.focus()
    }, 0)
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeSidebar()
        return
      }
      if (event.key !== 'Tab' || !sidebarRef.current) return
      const focusable = [...sidebarRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      )]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [closeSidebar, mobileSidebar, sidebarOpen])

  // 브라우저 탭 제목에 지금 화면을 적는다. 예: ‘검토요청 · SQA P1’
  useEffect(() => {
    document.title = documentTitleFor(activeTab, leaderMode)
  }, [activeTab, leaderMode])
  useEffect(() => () => {
    document.title = APP_DOCUMENT_TITLE
  }, [])

  // 모바일 상세의 하단 처리 버튼 줄(.mobile-action-bar)이 실제로 그려져 있으면 탭바를 비켜 준다.
  // 화면에 따라 숨은 상세 안에도 버튼 줄이 있을 수 있어 존재가 아니라 그려졌는지로 판단한다.
  useEffect(() => {
    const main = mainRef.current
    if (!main || typeof MutationObserver === 'undefined') return
    let frame = 0
    const check = () => {
      frame = 0
      const shown = [...main.querySelectorAll<HTMLElement>('.mobile-action-bar')].some(
        (bar) => bar.getClientRects().length > 0,
      )
      setActionBarShown(shown)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(check)
    }
    const observer = new MutationObserver(schedule)
    observer.observe(main, { attributes: true, attributeFilter: ['class', 'hidden', 'style'], childList: true, subtree: true })
    window.addEventListener('resize', schedule)
    schedule()
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [])

  // 화면별 스크롤 위치를 기억한다. 페이지 스크롤은 .content > .stack이 맡는다.
  useEffect(() => {
    const main = mainRef.current
    if (!main) return
    const onScroll = (event: Event) => {
      const target = event.target
      if (!(target instanceof HTMLElement) || target.parentElement !== main || !target.classList.contains('stack')) return
      scrollPositionsRef.current.set(activeTabRef.current, target.scrollTop)
    }
    main.addEventListener('scroll', onScroll, true)
    return () => main.removeEventListener('scroll', onScroll, true)
  }, [])

  // 다른 메뉴에 다녀오면 보던 위치로 돌아가고, 데스크톱 메뉴로 이동했으면 새 화면 제목(h1)에 포커스를 옮긴다.
  // 화면은 늦게 불러올 수 있어(지연 로딩·데이터) 내용이 붙을 때까지 잠깐 기다린다.
  useLayoutEffect(() => {
    activeTabRef.current = activeTab
    const main = mainRef.current
    const focusHeading = focusHeadingOnNavigateRef.current
    focusHeadingOnNavigateRef.current = false
    if (!main) return
    // 항목 링크(?id=)로 들어오면 각 화면이 그 항목으로 스크롤한다.
    const savedTop = parseAppHash().entityId ? 0 : scrollPositionsRef.current.get(activeTab) ?? 0
    let restored = savedTop <= 0
    let focused = !focusHeading
    if (restored && focused) return
    const settle = () => {
      const stack = main.querySelector<HTMLElement>(':scope > .stack')
      if (!stack) return false
      if (!restored) {
        stack.scrollTop = savedTop
        restored = Math.abs(stack.scrollTop - savedTop) <= 1
      }
      if (!focused) {
        const heading = stack.querySelector<HTMLElement>('h1')
        if (heading) {
          if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
          heading.focus({ preventScroll: true })
          focused = true
        }
      }
      return restored && focused
    }
    if (settle()) return
    let timer = 0
    const observer = new MutationObserver(() => {
      if (!settle()) return
      observer.disconnect()
      window.clearTimeout(timer)
    })
    observer.observe(main, { childList: true, subtree: true })
    timer = window.setTimeout(() => observer.disconnect(), 2000)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [activeTab])

  const navigateFromSidebar = (tab: TabId) => {
    const inDrawer = mobileSidebar && sidebarOpen
    // 서랍에서 고르면 햄버거로 포커스를 돌려준다(서랍이 닫히며 inert가 되기 때문). 데스크톱은 새 화면 제목으로.
    focusHeadingOnNavigateRef.current = !inDrawer && tab !== activeTab
    setActiveTab(tab, undefined, inDrawer ? { replace: true } : undefined)
    closeSidebar(mobileSidebar)
  }

  const navigateFromTabBar = (event: React.MouseEvent<HTMLAnchorElement>, tab: TabId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    if (tab === activeTab) {
      // 지금 화면의 탭을 다시 누르면 맨 위로 올라간다(앱 탭바의 익숙한 동작).
      mainRef.current?.querySelector<HTMLElement>(':scope > .stack')?.scrollTo({ top: 0, behavior: preferredScrollBehavior() })
      return
    }
    setActiveTab(tab)
  }

  return (
    <div
      className="app-shell brand-shell"
      data-bottom-bar={actionBarShown ? 'action' : 'tabs'}
      data-visual-theme="brand-shell"
    >
      <a
        className="skip-link"
        href="#main-content"
        onClick={(event) => {
          event.preventDefault()
          document.getElementById('main-content')?.focus()
        }}
      >본문으로 건너뛰기</a>
      <div
        aria-hidden="true"
        className={`overlay${sidebarOpen ? ' visible' : ''}`}
        onClick={() => closeSidebar()}
      />
      <aside
        ref={sidebarRef}
        aria-hidden={mobileSidebar && !sidebarOpen ? true : undefined}
        aria-label="주 메뉴"
        className={`sidebar${sidebarOpen ? ' open' : ''}`}
        id="primary-navigation"
      >
        <div className="sidebar-top">
          {/* 브랜드 마크 'P'는 .brand::before가 그린다 */}
          <div className="brand">
            <div>
              <strong>SQA P1</strong>
              <span>Workflow</span>
            </div>
          </div>
          <button aria-label="메뉴 닫기" className="sidebar-close" onClick={() => closeSidebar()} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </div>
        <button
          className="sidebar-command"
          onClick={() => {
            closeSidebar(false)
            onOpenCommandPalette()
          }}
          type="button"
        >
          <Search aria-hidden="true" size={16} />
          <span>빠른 검색</span>
        </button>
        <nav aria-label="주 메뉴 항목">
          {navSections.map((section) => (
            <div className="nav-group" key={section.label}>
              <span className="nav-group-label">{section.label}</span>
              {section.items.map((tab) => (
                <button
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  aria-label={shellTabAccessibleName(tab.label, tabs[tab.id])}
                  className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
                  key={tab.id}
                  onClick={() => navigateFromSidebar(tab.id)}
                  type="button"
                >
                  {tabIcons[tab.id]}
                  {tab.label}
                  <NavBadges state={tabs[tab.id]} />
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-user" title={profile.email}>
            <div className="sidebar-footer-avatar" aria-hidden="true">
              {profile.name.trim().charAt(0) || '?'}
            </div>
            <div className="sidebar-footer-info">
              <strong>{profile.name}</strong>
              <small>{roleLabels[profile.role]}{readOnly ? ' · 읽기 전용' : ''}</small>
            </div>
          </div>
          <div className="sidebar-footer-actions">
            <button
              aria-pressed={density === 'compact'}
              className="sidebar-footer-button density-toggle"
              onClick={toggleDensity}
              type="button"
            >
              <Rows3 aria-hidden="true" size={15} />
              촘촘하게 보기
            </button>
            {/* 휴대폰에서는 상단바를 알림만 남기고 새로고침을 여기로 옮긴다(G-2). */}
            <button
              className="sidebar-footer-button sidebar-refresh"
              disabled={refreshing || saving}
              onClick={() => {
                closeSidebar(false)
                onRefresh()
              }}
              type="button"
            >
              <RefreshCw aria-hidden="true" className={refreshing ? 'spin' : undefined} size={15} />
              {refreshing ? '새로고침 중…' : '새로고침'}
            </button>
            <button className="sidebar-footer-button" onClick={onSignOut} type="button">
              <LogOut aria-hidden="true" size={15} />
              로그아웃
            </button>
          </div>
          {onPreviewRoleChange && (
            <div className="segmented role-switch" role="group" aria-label="미리보기 역할">
              {PREVIEW_ROLES.map(({ role, label }) => (
                <button
                  aria-pressed={profile.role === role}
                  className={profile.role === role ? 'selected' : ''}
                  key={role}
                  onClick={() => onPreviewRoleChange(role)}
                  type="button"
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
      <main className="content" id="main-content" ref={mainRef} tabIndex={-1}>
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menuButtonRef}
              aria-controls="primary-navigation"
              aria-expanded={sidebarOpen}
              aria-label="메뉴 열기"
              className="hamburger"
              onClick={(event) => openSidebar(event.currentTarget)}
              type="button"
            >
              <Menu aria-hidden="true" size={22} />
            </button>
            <div className="topbar-heading">
              {/* 화면 제목(h1)은 각 화면 머리말에 하나만 둔다. 여기는 지금 위치를 알려 주는 표시다. */}
              <span className="topbar-title">{headerLabel}</span>
              {readOnly && (
                <span className="readonly-chip" title="파트 현황을 볼 수 있지만 수정할 수는 없어요.">읽기 전용</span>
              )}
            </div>
          </div>
          <button className="topbar-cmd" onClick={onOpenCommandPalette} type="button">
            <Search size={14} aria-hidden="true" />
            <span>{commandSearchPlaceholder(leaderMode)}…</span>
            <span className="k">{shortcutHint()}</span>
          </button>
          <div className="topbar-actions">
            {syncLabel && <span className="sync-label">{syncLabel}</span>}
            {busyLabel && (
              <span aria-label={busyLabel} aria-live="polite" className="saving" role="status">
                <RefreshCw className="spin" size={14} aria-hidden="true" />
                <span className="operation-status-label">{busyLabel}</span>
              </span>
            )}
            {showSyncWarning && (
              <span aria-live="polite" className="sync-status" role="status">
                <button
                  aria-controls={syncDetailOpen ? syncDetailId : undefined}
                  aria-expanded={syncDetailOpen}
                  className="sync-warning"
                  onClick={() => setSyncDetailOpen((value) => !value)}
                  title={syncWarning.title}
                  type="button"
                >
                  <AlertTriangle aria-hidden="true" size={14} />
                  <span className="operation-status-label">{syncWarning.label}</span>
                </button>
                {syncDetailOpen && (
                  <span className="sync-popover" id={syncDetailId}>
                    <span>{syncWarning.title}</span>
                    <button
                      className="ghost compact"
                      disabled={refreshing || saving}
                      onClick={() => {
                        setSyncDetailOpen(false)
                        onRefresh()
                      }}
                      type="button"
                    >
                      다시 시도
                    </button>
                  </span>
                )}
              </span>
            )}
            <button
              ref={notificationButtonRef}
              aria-expanded={notifOpen}
              aria-haspopup="dialog"
              aria-label={unreadNotifications > 0 ? `알림 ${unreadNotifications}건` : '알림'}
              className="icon-button topbar-notif"
              onClick={() => setNotifOpen((value) => !value)}
              title="알림"
              type="button"
            >
              <Bell aria-hidden="true" size={16} />
              {unreadNotifications > 0 && <span className="dot" aria-hidden="true" />}
            </button>
            <button
              aria-label="새로고침"
              className="icon-button topbar-refresh"
              title="새로고침"
              onClick={onRefresh}
              type="button"
              disabled={refreshing || saving}
            >
              <RefreshCw aria-hidden="true" className={refreshing ? 'spin' : undefined} size={16} />
            </button>
          </div>
          {notifOpen && (
            <Suspense fallback={null}>
              <NotificationPanel
                notifications={notifications}
                desktopNotifications={desktopNotifications}
                onClose={closeNotifications}
                onMarkAllRead={() => {
                  onMarkAllRead()
                  closeNotifications()
                }}
                onSelect={setActiveTab}
              />
            </Suspense>
          )}
        </header>
        {dataWarnings.length > 0 && (
          <div className="data-stale-banner" role="status" aria-live="polite">
            <AlertTriangle aria-hidden="true" size={16} />
            <span>
              <strong>일부 데이터를 새로 불러오지 못했어요.</strong>
              <small>{dataWarnings.join(' ')}</small>
            </span>
            <button className="ghost compact" disabled={refreshing || saving} onClick={onRefresh} type="button">
              다시 시도
            </button>
          </div>
        )}
        {children}
      </main>
      <nav aria-label="주요 메뉴 바로가기" className="mobile-tabbar" hidden={sidebarOpen || actionBarShown}>
        {TAB_BAR_TABS.map((tab) => {
          const label = tab === 'reviews' ? '검토요청' : tabShortLabel(tab, leaderMode)
          const state = tabs[tab]
          return (
            <a
              aria-current={activeTab === tab ? 'page' : undefined}
              aria-label={shellTabAccessibleName(label, state)}
              className="mobile-tabbar-item"
              href={buildAppHash(tab)}
              key={tab}
              onClick={(event) => navigateFromTabBar(event, tab)}
            >
              <span className="mobile-tabbar-icon">
                {tabIcons[tab]}
                <NavBadges state={state} />
              </span>
              <span className="mobile-tabbar-label">{label}</span>
            </a>
          )
        })}
        <button
          aria-controls="primary-navigation"
          aria-expanded={sidebarOpen}
          aria-label="전체 메뉴"
          className="mobile-tabbar-item"
          onClick={(event) => openSidebar(event.currentTarget)}
          type="button"
        >
          <span className="mobile-tabbar-icon">
            <LayoutGrid aria-hidden="true" size={18} />
          </span>
          <span className="mobile-tabbar-label">전체</span>
        </button>
      </nav>
      {/* 성공은 3초(행동 버튼이 있으면 5초) 뒤 사라지고, 경고·오류는 사용자가 닫을 때까지 유지한다. */}
      <ToastViewport onDismiss={onDismissToast ?? noopDismiss} toasts={toasts} />
    </div>
  )
}
