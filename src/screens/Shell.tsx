import { useState } from 'react'
import type { AppData, Profile, Role } from '../types'
import type { TabId, ToastMessage } from '../app/types'
import { roleLabels } from '../lib/format'
import {
  BriefcaseBusiness,
  Check,
  ClipboardList,
  FolderKanban,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  RefreshCw,
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
  pendingCount,
  unreadReviewsCount,
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
  onRefresh: () => void
  onSignOut: () => void
  onPreviewRoleChange?: (role: Role) => void
  children: React.ReactNode
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const memberCount = data.profiles.filter((item) => item.role === 'member').length
  const memberReviewCount = data.reviewRequests.filter((request) => request.requester_id === profile.id).length
  const memberProjectCount = data.projectAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberProductCount = data.productAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const memberDutyCount = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id).length
  const navSections: Array<{
    label: string
    items: Array<{ id: TabId; label: string; icon: React.ReactNode; count?: number; unread?: boolean }>
  }> = leaderMode
    ? [
        {
          label: '워크스페이스',
          items: [
            { id: 'dashboard', label: '홈', icon: <ClipboardList size={18} /> },
            {
              id: 'reviews',
              label: '검토요청',
              icon: <Check size={18} />,
              count: unreadReviewsCount > 0 ? unreadReviewsCount : pendingCount,
              unread: unreadReviewsCount > 0,
            },
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
            { id: 'reviews', label: '내 검토요청', icon: <Check size={18} />, count: unreadReviewsCount > 0 ? unreadReviewsCount : memberReviewCount, unread: unreadReviewsCount > 0 },
            { id: 'projects', label: '내 프로젝트', icon: <FolderKanban size={18} />, count: memberProjectCount },
            { id: 'work', label: '내 담당', icon: <Package size={18} />, count: memberProductCount + memberDutyCount },
          ],
        },
      ]
  const tabDescriptionsV2: Record<TabId, { label: string; description: string }> = {
    dashboard: {
      label: '홈',
      description: leaderMode ? `대기 검토 ${pendingCount}건 · 파트원 ${memberCount}명` : `${profile.name}님의 오늘 업무`,
    },
    reviews: {
      label: leaderMode ? '홈 / 검토요청' : '내 업무 / 검토요청',
      description: leaderMode ? '검토 대기 항목과 피드백 흐름' : '내가 요청한 검토와 답변',
    },
    projects: {
      label: leaderMode ? '홈 / 프로젝트' : '내 업무 / 프로젝트',
      description: leaderMode ? '상태별 프로젝트와 담당자 배정' : '내게 배정된 프로젝트',
    },
    team: { label: '홈 / 파트원', description: '파트원별 담당 제품, 업무, 프로젝트' },
    products: { label: '마스터 / 제품', description: '제품 등록과 담당자 배정 기준' },
    duties: { label: '마스터 / 업무 카테고리', description: '업무 카테고리와 담당 범위' },
    invites: { label: '마스터 / 초대 관리', description: '초대 대상과 역할 관리' },
    activity: { label: '워크스페이스 / 활동 로그', description: '팀 전체 활동 이력' },
    work: { label: '내 업무 / 내 담당', description: '내 담당 제품과 정기 업무' },
  }
  const activeDescription = tabDescriptionsV2[activeTab]
  const syncLabel = lastSyncedAt
    ? `마지막 동기화 ${lastSyncedAt.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`
    : null

  return (
    <div className="app-shell">
      <div className={`overlay${sidebarOpen ? ' visible' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`sidebar${sidebarOpen ? ' open' : ''}`}>
        <div className="sidebar-top">
          <div className="brand">
            <BriefcaseBusiness size={28} />
            <div>
              <strong>Part Ops</strong>
              <span>업무관리</span>
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
          <div>
            <strong>{profile.name}</strong>
            <small>{roleLabels[profile.role]}</small>
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
          <div className="topbar-actions">
            {message && (
              <span className="toast" data-tone={message.tone}>
                {message.text}
              </span>
            )}
            {syncLabel && <span className="sync-label">{syncLabel}</span>}
            {refreshing && (
              <span className="saving">
                <RefreshCw className="spin" size={14} />
                갱신 중
              </span>
            )}
            {saving && <span className="saving">저장 중</span>}
            <button className="icon-button" title="새로고침" onClick={onRefresh} type="button">
              <RefreshCw className={refreshing ? 'spin' : undefined} size={18} />
            </button>
            <button className="icon-button" title="로그아웃" onClick={onSignOut} type="button">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        {children}
      </main>
    </div>
  )
}

