import { useState } from 'react'
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
    items: Array<{ id: TabId; label: string; icon: React.ReactNode; count?: number; unread?: boolean }>
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
  // stale은 최근 성공 여부와 무관하게 백그라운드 동기화가 신뢰할 수 없다는 뜻이므로,
  // syncLabel(마지막 성공 시각)과 별개로 항상 노출한다. 업무 body/PII는 담지 않는다.
  const syncWarningTitle = syncHealth.stale
    ? `동기화가 지연되고 있습니다. 연속 실패 ${syncHealth.consecutiveFailures}회${
        syncHealth.lastErrorCode ? ` (오류 코드: ${syncHealth.lastErrorCode})` : ''
      }`
    : undefined

  return (
    <div className="app-shell brand-shell" data-visual-theme="brand-shell">
      <div className={`overlay${sidebarOpen ? ' visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          {/* 브랜드 마크 'P'는 .brand::before가 그린다 */}
          <div className="brand">
            <div>
              <strong>SQA P1</strong>
              <span>Workflow</span>
            </div>
          </div>
          <button aria-label="메뉴 닫기" className="sidebar-close" onClick={() => setSidebarOpen(false)} type="button">
            <X size={20} />
          </button>
        </div>
        <nav>
          {navSections.map((section) => (
            <div className="nav-group" key={section.label}>
              <span className="nav-group-label">{section.label}</span>
              {section.items.map((tab) => (
                <button
                  aria-current={activeTab === tab.id ? 'page' : undefined}
                  className={activeTab === tab.id ? 'nav-item active' : 'nav-item'}
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id)
                    setSidebarOpen(false)
                  }}
                  type="button"
                >
                  {tab.icon}
                  {tab.label}
                  {typeof tab.count === 'number' && (
                    <span className={tab.unread ? 'nav-badge unread' : 'nav-badge'}>{tab.count}</span>
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
            <button aria-label="메뉴 열기" className="hamburger" onClick={() => setSidebarOpen(true)} type="button">
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
            {syncHealth.stale && (
              <span className="sync-warning" role="status" aria-live="polite" title={syncWarningTitle}>
                <AlertTriangle aria-hidden="true" size={14} />
                동기화 지연
              </span>
            )}
            {refreshing && (
              <span className="saving" role="status" aria-live="polite">
                <RefreshCw className="spin" size={14} aria-hidden="true" />
                갱신 중
              </span>
            )}
            {saving && (
              <span className="saving" role="status" aria-live="polite">
                저장 중
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
              onClose={() => setNotifOpen(false)}
              onMarkAllRead={() => {
                onMarkAllRead()
                setNotifOpen(false)
              }}
              onSelect={setActiveTab}
            />
          )}
        </header>
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
