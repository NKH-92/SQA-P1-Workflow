import { useEffect, useState } from 'react'
import type { AppData, Profile, Role } from '../types'
import type { TabId, ToastMessage } from '../app/types'
import { roleLabels } from '../lib/format'
import type { AppNotification } from '../lib/notifications'
import type { DesktopNotificationControls } from '../app/hooks/useDesktopNotifications'
import { NotificationPanel } from '../components/NotificationPanel'
import {
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

type Density = 'comfortable' | 'compact'

function loadDensity(): Density {
  if (typeof localStorage === 'undefined') return 'comfortable'
  try {
    return localStorage.getItem('ui:density') === 'compact' ? 'compact' : 'comfortable'
  } catch {
    return 'comfortable'
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
  data: AppData
  leaderMode: boolean
  message: ToastMessage | null
  saving: boolean
  refreshing: boolean
  lastSyncedAt: Date | null
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
  // 간격 압축 모드. 문서 루트 data-density 속성으로 CSS 프리셋을 전환한다.
  const [density, setDensity] = useState<Density>(loadDensity)
  useEffect(() => {
    document.documentElement.dataset.density = density
    try {
      localStorage.setItem('ui:density', density)
    } catch {
      // 저장이 막힌 환경(사생활 보호 모드 등)에서도 토글 자체는 동작해야 한다.
    }
  }, [density])
  const unreadNotifications = notifications.filter((item) => item.unread).length
  const memberCount = data.profiles.filter((item) => item.role === 'member').length
  const memberReviewCount = data.reviewRequests.filter((request) => request.requester_id === profile.id).length
  const memberProjectCount = data.projectAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberProductCount = data.productAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberDutyCount = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const pendingChangeTaskCount = data.productChangeTasks.filter(
    (task) => task.status === 'pending' && (leaderMode || task.assignee_id === profile.id),
  ).length
  const navSections: Array<{
    label: string
    items: Array<{ id: TabId; label: string; icon: React.ReactNode; count?: number; unread?: boolean }>
  }> = leaderMode
    ? [
        {
          label: '워크스페이스',
          items: [
            { id: 'dashboard', label: '홈', icon: <ClipboardList size={18} /> },
            { id: 'announcements', label: '공지', icon: <Megaphone size={18} />, count: data.announcements.length },
            {
              id: 'reviews',
              label: '검토요청',
              icon: <Check size={18} />,
              count: unreadReviewsCount > 0 ? unreadReviewsCount : pendingCount,
              unread: unreadReviewsCount > 0,
            },
            { id: 'review-stats', label: '검토 통계', icon: <BarChart3 size={18} /> },
            { id: 'change-applications', label: '변경 적용', icon: <ClipboardPenLine size={18} />, count: pendingChangeTaskCount },
            { id: 'projects', label: '프로젝트', icon: <FolderKanban size={18} />, count: data.projects.length },
            { id: 'team', label: '파트원', icon: <Users size={18} />, count: memberCount },
            { id: 'activity', label: '활동 로그', icon: <MessageSquare size={18} />, count: data.activityLogs.length },
          ],
        },
        {
          label: '마스터',
          items: [
            { id: 'products', label: '제품', icon: <Package size={18} />, count: data.products.length },
            { id: 'duties', label: '업무 카테고리', icon: <ClipboardList size={18} />, count: data.duties.length },
            { id: 'invites', label: '초대 관리', icon: <ShieldCheck size={18} />, count: data.allowedUsers.length },
          ],
        },
      ]
    : [
        {
          label: '내 업무',
          items: [
            { id: 'dashboard', label: '홈', icon: <ClipboardList size={18} /> },
            { id: 'announcements', label: '공지', icon: <Megaphone size={18} />, count: data.announcements.length },
            { id: 'reviews', label: '내 검토요청', icon: <Check size={18} />, count: unreadReviewsCount > 0 ? unreadReviewsCount : memberReviewCount, unread: unreadReviewsCount > 0 },
            { id: 'change-applications', label: '변경 적용', icon: <ClipboardPenLine size={18} />, count: pendingChangeTaskCount },
            { id: 'projects', label: '내 프로젝트', icon: <FolderKanban size={18} />, count: memberProjectCount },
            { id: 'work', label: '내 담당', icon: <Package size={18} />, count: memberProductCount + memberDutyCount },
          ],
        },
      ]
  const tabDescriptions: Record<TabId, { label: string; description: string }> = {
    dashboard: {
      label: '홈',
      description: leaderMode ? `대기 검토 ${pendingCount}건 · 파트원 ${memberCount}명` : `${profile.name}님의 오늘 업무`,
    },
    announcements: {
      label: '워크스페이스 / 공지',
      description: '파트 공지와 상단 고정 안내',
    },
    reviews: {
      label: leaderMode ? '워크스페이스 / 검토요청' : '내 업무 / 검토요청',
      description: leaderMode ? '검토 대기 항목과 피드백 흐름' : '내가 요청한 검토와 답변',
    },
    'review-stats': {
      label: '워크스페이스 / 검토 통계',
      description: '요청자별 검토량, 제출 횟수와 상태 추이',
    },
    'change-applications': {
      label: leaderMode ? '워크스페이스 / 변경 적용' : '내 업무 / 변경 적용',
      description: leaderMode ? '변경건별 제품 적용률과 담당 공백' : '내 제품의 미적용 업무와 완료 이력',
    },
    projects: {
      label: leaderMode ? '워크스페이스 / 프로젝트' : '내 업무 / 프로젝트',
      description: leaderMode ? '상태별 프로젝트와 담당자 배정' : '내게 배정된 프로젝트',
    },
    team: { label: '워크스페이스 / 파트원', description: '파트원별 담당 제품, 업무, 프로젝트' },
    products: { label: '마스터 / 제품', description: '제품 등록과 담당자 배정 기준' },
    duties: { label: '마스터 / 업무 카테고리', description: '업무 카테고리와 담당 범위' },
    invites: { label: '마스터 / 초대 관리', description: '초대 대상과 역할 관리' },
    activity: { label: '워크스페이스 / 활동 로그', description: '팀 전체 활동 이력' },
    work: { label: '내 업무 / 내 담당', description: '내 담당 제품과 정기 업무' },
  }
  const activeDescription = tabDescriptions[activeTab]
  const syncLabel = lastSyncedAt
    ? `마지막 동기화 ${lastSyncedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : null

  return (
    <div className="app-shell">
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
          <button className="sidebar-close" onClick={() => setSidebarOpen(false)} type="button">
            <X size={20} />
          </button>
        </div>
        <nav>
          {navSections.map((section) => (
            <div className="nav-group" key={section.label}>
              <span className="nav-group-label">{section.label}</span>
              {section.items.map((tab) => (
                <button
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
            <button className="hamburger" onClick={() => setSidebarOpen(true)} type="button">
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
              aria-pressed={density === 'compact'}
              className="icon-button"
              onClick={() => setDensity(density === 'compact' ? 'comfortable' : 'compact')}
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
            <button className="icon-button" title="새로고침" onClick={onRefresh} type="button" disabled={refreshing || saving}>
              <RefreshCw className={refreshing ? 'spin' : undefined} size={16} />
            </button>
            <button className="icon-button" title="로그아웃" onClick={onSignOut} type="button">
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
