import { useEffect, useState, type ReactNode, type Ref } from 'react'
import { AlertTriangle, Bell, LayoutGrid, LayoutList, LogOut, RefreshCw, Search } from 'lucide-react'
import type { EffectivePresence } from '../data/validation/memberPresence'
import { PresenceButton } from '../features/office/components/PresenceButton'
import { roleLabels } from '../lib/format'
import type { Profile, Role } from '../types'

/**
 * 전체 화면 사무실 홈의 위 메뉴(HUD). 게임 화면처럼 로고·[기존 화면]·검색·알림·새로고침·전체 메뉴·프로필을 한 줄에 둔다.
 * 알림 패널·서랍 메뉴는 Shell이 그대로 맡고, 여기서는 누른 것만 알린다.
 */
export function OfficeHudBar({
  profile,
  readOnly,
  busyLabel,
  syncWarning,
  unreadNotifications,
  notificationsOpen,
  refreshing,
  saving,
  menuOpen,
  notificationButtonRef,
  menuButtonRef,
  shortcut,
  previewRoles,
  presence,
  onClassicHome,
  onToggleNotifications,
  onOpenMenu,
  onOpenCommandPalette,
  onRefresh,
  onSignOut,
  onPreviewRoleChange,
  children,
}: {
  profile: Profile
  readOnly: boolean
  busyLabel: string | null
  /** 동기화가 늦어질 때만 넘긴다. */
  syncWarning: { label: string; title: string } | null
  unreadNotifications: number
  notificationsOpen: boolean
  refreshing: boolean
  saving: boolean
  menuOpen: boolean
  notificationButtonRef: Ref<HTMLButtonElement>
  menuButtonRef: Ref<HTMLButtonElement>
  shortcut: string
  previewRoles: ReadonlyArray<{ role: Role; label: string }>
  /** 내 상태 단추. 상태가 없는 사람(팀장)에게는 넘기지 않는다. */
  presence?: { current: EffectivePresence | null; onOpen: () => void }
  /** 기존 화면으로 바꾼다. 없으면 버튼을 숨긴다. */
  onClassicHome?: () => void
  onToggleNotifications: () => void
  onOpenMenu: (opener: HTMLElement) => void
  onOpenCommandPalette: () => void
  onRefresh: () => void
  onSignOut: () => void
  onPreviewRoleChange?: (role: Role) => void
  /** 알림 패널(열려 있을 때) */
  children?: ReactNode
}) {
  const [profileOpen, setProfileOpen] = useState(false)

  useEffect(() => {
    if (!profileOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setProfileOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [profileOpen])

  return (
    <header className="office-hud-bar">
      <div className="office-hud-left">
        <div aria-hidden="true" className="office-hud-brand">
          <span className="office-hud-mark">P</span>
          <strong>SQA P1</strong>
        </div>
        {onClassicHome && (
          <button
            className="office-hud-button"
            onClick={onClassicHome}
            title="왼쪽 메뉴와 할 일 목록이 있는 기존 화면으로 바꿔요."
            type="button"
          >
            <LayoutList aria-hidden="true" size={15} />
            기존 화면
          </button>
        )}
        {readOnly && <span className="readonly-chip">읽기 전용</span>}
      </div>
      <div className="office-hud-right">
        {busyLabel && (
          <span aria-label={busyLabel} aria-live="polite" className="office-hud-status" role="status">
            <RefreshCw className="spin" size={14} aria-hidden="true" />
            <span className="office-hud-label">{busyLabel}</span>
          </span>
        )}
        {syncWarning && (
          <button className="office-hud-warning" onClick={onRefresh} title={syncWarning.title} type="button">
            <AlertTriangle aria-hidden="true" size={14} />
            <span className="office-hud-label">{syncWarning.label}</span>
          </button>
        )}
        <button className="office-hud-button" onClick={onOpenCommandPalette} type="button">
          <Search aria-hidden="true" size={15} />
          <span className="office-hud-label">검색</span>
          <span className="k">{shortcut}</span>
        </button>
        <button
          ref={notificationButtonRef}
          aria-expanded={notificationsOpen}
          aria-haspopup="dialog"
          aria-label={unreadNotifications > 0 ? `알림 ${unreadNotifications}건` : '알림'}
          className="office-hud-icon"
          onClick={onToggleNotifications}
          title="알림"
          type="button"
        >
          <Bell aria-hidden="true" size={16} />
          {unreadNotifications > 0 && <span className="dot" aria-hidden="true" />}
        </button>
        <button
          aria-label="새로고침"
          className="office-hud-icon"
          disabled={refreshing || saving}
          onClick={onRefresh}
          title="새로고침"
          type="button"
        >
          <RefreshCw aria-hidden="true" className={refreshing ? 'spin' : undefined} size={16} />
        </button>
        <button
          ref={menuButtonRef}
          aria-controls="primary-navigation"
          aria-expanded={menuOpen}
          aria-label="전체 메뉴"
          className="office-hud-icon"
          onClick={(event) => onOpenMenu(event.currentTarget)}
          title="전체 메뉴"
          type="button"
        >
          <LayoutGrid aria-hidden="true" size={16} />
        </button>
        {presence && <PresenceButton current={presence.current} onOpen={presence.onOpen} variant="hud" />}
        <div className="office-hud-profile">
          <button
            aria-expanded={profileOpen}
            aria-label={`${profile.name}, ${roleLabels[profile.role]}`}
            className="office-hud-avatar"
            onClick={() => setProfileOpen((value) => !value)}
            title={profile.email}
            type="button"
          >
            {profile.name.trim().charAt(0) || '?'}
          </button>
          {profileOpen && (
            <div className="office-hud-popover">
              <strong>{profile.name}</strong>
              <small>{roleLabels[profile.role]}{readOnly ? ' · 읽기 전용' : ''}</small>
              <button className="ghost compact" onClick={onSignOut} type="button">
                <LogOut aria-hidden="true" size={15} />
                로그아웃
              </button>
            </div>
          )}
        </div>
        {onPreviewRoleChange && (
          <div className="segmented role-switch office-hud-roles" role="group" aria-label="미리보기 역할">
            {previewRoles.map(({ role, label }) => (
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
      {children}
    </header>
  )
}
