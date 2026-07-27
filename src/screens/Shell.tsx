import { useCallback, useEffect, useRef, useState } from 'react'
import type { Profile, Role } from '../types'
import type { TabId, ToastMessage } from '../app/types'
import type { SyncHealth } from '../app/hooks/useSyncHealth'
import { roleLabels } from '../lib/format'
import { navigationItemsForRole, tabHeaderLabel } from '../lib/navigation'
import type { AppNotification } from '../lib/notifications'
import type { DesktopNotificationControls } from '../app/hooks/useDesktopNotifications'
import { NotificationPanel } from '../components/NotificationPanel'
import { buildShellModel, type ShellFeatureData } from './shellModel'
import { useDensityPreference } from './useDensityPreference'
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Check,
  ClipboardList,
  ClipboardPenLine,
  FolderKanban,
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
    ? ` 연속 실패 ${syncHealth.consecutiveFailures}회.`
    : ''

  switch (syncHealth.lastErrorCode) {
    case 'network':
      return {
        label: '연결 지연',
        title: `서버 연결이 불안정합니다. 네트워크를 확인하고 다시 시도해 주세요.${failureSuffix}`,
      }
    case 'SQA_BOOTSTRAP_SCHEMA_MISMATCH':
      return {
        label: '업데이트 필요',
        title: `앱과 데이터 버전이 맞지 않습니다. 화면을 새로고침한 뒤 계속되면 관리자에게 알려 주세요.${failureSuffix}`,
      }
    case '42501':
    case 'PGRST301':
      return {
        label: '권한 확인 필요',
        title: `데이터 접근 권한을 확인하지 못했습니다. 다시 로그인한 뒤 계속되면 관리자에게 알려 주세요.${failureSuffix}`,
      }
    default:
      return {
        label: '동기화 지연',
        title: `최신 데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.${failureSuffix}`,
      }
  }
}

export function Shell({
  activeTab,
  setActiveTab,
  profile,
  data,
  leaderMode,
  message,
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
  onRefresh,
  onSignOut,
  onPreviewRoleChange,
  children,
}: {
  activeTab: TabId
  setActiveTab: (tab: TabId, entityId?: string) => void
  profile: Profile
  data: ShellFeatureData
  leaderMode: boolean
  message: ToastMessage | null
  saving: boolean
  refreshing: boolean
  lastSyncedAt: Date | null
  dataWarnings?: string[]
  /** 백그라운드 동기화 상태 관측 — topbar persistent 경고 표시 여부를 결정한다. */
  syncHealth: SyncHealth
  pendingCount: number
  unreadReviewsCount: number
  notifications: AppNotification[]
  /** 파트장에게만 내려온다 — 데스크톱 알림 설정 토글. */
  desktopNotifications?: DesktopNotificationControls
  onMarkAllRead: () => void
  onOpenCommandPalette: () => void
  onRefresh: () => void
  onSignOut: () => void
  onPreviewRoleChange?: (role: Role) => void
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const [mobileSidebar, setMobileSidebar] = useState(false)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const sidebarRef = useRef<HTMLElement>(null)
  const notificationButtonRef = useRef<HTMLButtonElement>(null)
  const { density, toggleDensity } = useDensityPreference()
  const { memberCount, unreadNotifications, tabs } = buildShellModel({
    data,
    profile,
    leaderMode,
    pendingCount,
    unreadReviewsCount,
    notifications,
  })
  const tabIcons: Record<TabId, React.ReactNode> = {
    dashboard: <ClipboardList size={18} />,
    announcements: <Megaphone size={18} />,
    reviews: <Check size={18} />,
    'review-stats': <BarChart3 size={18} />,
    'change-applications': <ClipboardPenLine size={18} />,
    projects: <FolderKanban size={18} />,
    team: <Users size={18} />,
    products: <Package size={18} />,
    duties: <ClipboardList size={18} />,
    invites: <ShieldCheck size={18} />,
    work: <Package size={18} />,
    activity: <MessageSquare size={18} />,
  }
  const navSections: Array<{
    label: string
    items: Array<{ id: TabId; label: string; icon: React.ReactNode; count?: number; unreadCount?: number }>
  }> = []
  for (const item of navigationItemsForRole(leaderMode)) {
    let section = navSections[navSections.length - 1]
    if (!section || section.label !== item.section) {
      section = { label: item.section, items: [] }
      navSections.push(section)
    }
    section.items.push({
      id: item.tab,
      label: item.sidebarLabel,
      icon: tabIcons[item.tab],
      ...tabs[item.tab],
    })
  }
  const tabDescriptions: Record<TabId, string> = {
    dashboard: leaderMode ? `대기 검토 ${pendingCount}건 · 파트원 ${memberCount}명` : `${profile.name}님의 오늘 업무`,
    announcements: '파트 공지와 상단 고정 안내',
    reviews: leaderMode ? '검토 대기 항목과 피드백 흐름' : '내가 요청한 검토와 답변',
    'review-stats': '요청자별 검토량, 제출 횟수와 상태 추이',
    'change-applications': leaderMode ? '변경건별 제품 적용률과 담당 공백' : '내 제품의 미적용 업무와 완료 이력',
    projects: leaderMode ? '상태별 프로젝트와 담당자 배정' : '내게 배정된 프로젝트',
    team: '파트원별 담당 제품, 업무, 프로젝트',
    products: '제품 등록과 담당자 배정 기준',
    duties: '업무 카테고리와 담당 범위',
    invites: '초대 대상과 역할 관리',
    activity: '팀 전체 활동 이력',
    work: '내 담당 제품과 정기 업무',
  }
  const activeDescription = {
    label: tabHeaderLabel(activeTab, leaderMode),
    description: tabDescriptions[activeTab],
  }
  const syncLabel = lastSyncedAt
    ? `마지막 동기화 ${lastSyncedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : null
  const syncWarning = buildSyncWarning(syncHealth)
  const operationStatus = saving
    ? { label: '저장 및 동기화 중', tone: 'saving' as const }
    : refreshing
      ? { label: '갱신 중', tone: 'saving' as const }
      : syncHealth.stale
        ? { label: syncWarning.label, tone: 'warning' as const }
        : null

  const closeSidebar = useCallback((restoreFocus = true) => {
    setSidebarOpen(false)
    if (restoreFocus) window.setTimeout(() => menuButtonRef.current?.focus(), 0)
  }, [])

  const closeNotifications = useCallback(() => {
    setNotifOpen(false)
    window.setTimeout(() => notificationButtonRef.current?.focus(), 0)
  }, [])

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

  return (
    <div className="app-shell brand-shell" data-visual-theme="brand-shell">
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
            <X size={20} />
          </button>
        </div>
        <nav aria-label="주 메뉴 항목">
          {navSections.map((section) => (
            <div className="nav-group" key={section.label}>
              <span className="nav-group-label">{section.label}</span>
              {section.items.map((tab) => (
                <button
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  aria-label={tab.id === 'reviews'
                    ? `${tab.label}, 대기 ${tab.count ?? 0}건${tab.unreadCount ? `, 새 알림 ${tab.unreadCount}건` : ''}`
                    : undefined}
                  className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                    // Desktop navigation must not focus the hidden hamburger, while a
                    // mobile drawer must move focus out before it becomes inert.
                    closeSidebar(mobileSidebar)
                  }}
                  type="button"
                >
                  {tab.icon}
                  {tab.label}
                  {typeof tab.count === 'number' && (
                    <span className="nav-badge">{tab.count}</span>
                  )}
                  {Boolean(tab.unreadCount) && (
                    <span aria-hidden="true" className="nav-unread-badge">
                      {tab.unreadCount! > 99 ? '99+' : tab.unreadCount}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-footer" title={profile.email}>
          <div className="sidebar-footer-user">
            <div className="sidebar-footer-avatar" aria-hidden="true">
              {profile.name.trim().charAt(0) || '?'}
            </div>
            <div className="sidebar-footer-info">
              <strong>{profile.name}</strong>
              <small>{roleLabels[profile.role]}</small>
            </div>
          </div>
          {onPreviewRoleChange && (
            <div className="segmented">
              <button
                className={profile.role === 'leader' ? 'selected' : ''}
                onClick={() => onPreviewRoleChange('leader')}
                type="button"
              >
                파트장
              </button>
              <button
                className={profile.role === 'member' ? 'selected' : ''}
                onClick={() => onPreviewRoleChange('member')}
                type="button"
              >
                파트원
              </button>
            </div>
          )}
        </div>
      </aside>
      <main className="content">
        <header className="topbar">
          <div className="topbar-left">
            <button
              ref={menuButtonRef}
              aria-controls="primary-navigation"
              aria-expanded={sidebarOpen}
              aria-label="메뉴 열기"
              className="hamburger"
              onClick={() => setSidebarOpen(true)}
              type="button"
            >
              <Menu size={22} />
            </button>
            <div>
              <h1>{activeDescription.label}</h1>
              <p>{activeDescription.description}</p>
            </div>
          </div>
          <button className="topbar-cmd" onClick={onOpenCommandPalette} type="button">
            <Search size={14} aria-hidden="true" />
            <span>화면, 검토요청, 파트원 검색...</span>
            <span className="k">Ctrl K</span>
          </button>
          <div className="topbar-actions">
            {syncLabel && <span className="sync-label">{syncLabel}</span>}
            {operationStatus && (
              <span
                aria-label={operationStatus.label}
                className={operationStatus.tone === 'warning' ? 'sync-warning' : 'saving'}
                role="status"
                aria-live="polite"
                title={operationStatus.tone === 'warning' ? syncWarning.title : undefined}
              >
                {operationStatus.tone === 'warning'
                  ? <AlertTriangle aria-hidden="true" size={14} />
                  : <RefreshCw className="spin" size={14} aria-hidden="true" />}
                <span className="operation-status-label">{operationStatus.label}</span>
              </span>
            )}
            <button
              aria-label={density === 'compact' ? '간격 보통으로 보기' : '간격 압축해서 보기'}
              aria-pressed={density === 'compact'}
              className="icon-button"
              onClick={toggleDensity}
              title={density === 'compact' ? '간격 보통으로 보기' : '간격 압축해서 보기'}
              type="button"
            >
              <Rows3 size={16} />
            </button>
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
              <Bell size={16} />
              {unreadNotifications > 0 && <span className="dot" aria-hidden="true" />}
            </button>
            <button
              aria-label="새로고침"
              className="icon-button"
              title="새로고침"
              onClick={onRefresh}
              type="button"
              disabled={refreshing || saving}
            >
              <RefreshCw className={refreshing ? 'spin' : undefined} size={16} />
            </button>
            <button aria-label="로그아웃" className="icon-button" title="로그아웃" onClick={onSignOut} type="button">
              <LogOut size={16} />
            </button>
          </div>
          {notifOpen && (
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
          )}
        </header>
        {dataWarnings.length > 0 && (
          <div className="data-stale-banner" role="status" aria-live="polite">
            <AlertTriangle aria-hidden="true" size={16} />
            <span>
              <strong>일부 데이터가 최신이 아닙니다.</strong>
              <small>{dataWarnings.join(' ')}</small>
            </span>
            <button className="ghost compact" disabled={refreshing || saving} onClick={onRefresh} type="button">
              다시 시도
            </button>
          </div>
        )}
        {children}
      </main>
      {/* 결과 토스트는 우하단 고정 — topbar는 진행 상태 표시만 담당한다. */}
      {message && (
        <div className="toast-viewport">
          <span className="toast" data-tone={message.tone} role="status" aria-live="polite">
            {message.text}
          </span>
        </div>
      )}
    </div>
  )
}
