import { useEffect, useRef } from 'react'
import { Bell, Monitor } from 'lucide-react'
import type { AppNotification } from '../lib/notifications'
import type { DesktopNotificationControls } from '../app/hooks/useDesktopNotifications'
import type { TabId } from '../app/types'

export function NotificationPanel({
  notifications,
  desktopNotifications,
  onClose,
  onMarkAllRead,
  onSelect,
}: {
  notifications: AppNotification[]
  /** 파트장에게만 내려온다 — 새 검토요청 데스크톱 알림 토글. */
  desktopNotifications?: DesktopNotificationControls
  onClose: () => void
  onMarkAllRead: () => void
  onSelect: (tab: TabId, entityId?: string) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const unread = notifications.filter((item) => item.unread).length

  // 바깥 클릭 / Esc 로 닫기. 알림 버튼 자체의 클릭은 토글이므로 제외한다.
  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (panelRef.current?.contains(target)) return
      if ((target as HTMLElement).closest?.('.topbar-notif')) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [onClose])

  return (
    <div className="notif-panel" ref={panelRef} role="dialog" aria-label="알림">
      <div className="notif-head">
        <h4>
          <Bell size={15} aria-hidden="true" />
          알림
          {unread > 0 && <span className="n">{unread}</span>}
        </h4>
        {unread > 0 && (
          <button className="mark-all" onClick={onMarkAllRead} type="button">
            모두 읽음
          </button>
        )}
      </div>
      <div className="notif-list">
        {notifications.length === 0 && <p className="notif-empty">새로운 알림이 없습니다.</p>}
        {notifications.map((item) => (
          <button
            className={item.unread ? 'notif-item unread' : 'notif-item'}
            data-urgency={item.urgency}
            key={item.id}
            onClick={() => {
              onSelect(item.tab, item.entityId)
              onClose()
            }}
            type="button"
          >
            <span className="notif-item-icon" aria-hidden="true">
              {item.actor}
            </span>
            <span className="notif-item-body">
              <p>{item.title}</p>
              <small>
                {item.when} · {item.kind}
              </small>
            </span>
          </button>
        ))}
      </div>
      {desktopNotifications?.supported && (
        <div className="notif-pref">
          <label>
            <input
              checked={desktopNotifications.enabled}
              onChange={() => void desktopNotifications.toggle()}
              type="checkbox"
            />
            <Monitor size={13} aria-hidden="true" />새 검토요청 데스크톱 알림
          </label>
          {desktopNotifications.permission === 'denied' && (
            <small>브라우저가 이 사이트의 알림을 차단 중입니다. 주소창 자물쇠 → 알림 허용 후 다시 켜 주세요.</small>
          )}
          {desktopNotifications.enabled && (
            <div className="notif-pref-privacy">
              <label>
                <input
                  checked={desktopNotifications.hideRequesterName}
                  onChange={() => desktopNotifications.toggleHideRequesterName()}
                  type="checkbox"
                />
                요청자 이름 숨기기
              </label>
              <label>
                <input
                  checked={desktopNotifications.revealReviewTitle}
                  onChange={() => desktopNotifications.toggleRevealReviewTitle()}
                  type="checkbox"
                />
                알림에 검토 제목 표시
              </label>
              <small>잠금화면에서도 노출될 수 있어 기본값은 검토 제목을 표시하지 않습니다.</small>
            </div>
          )}
        </div>
      )}
      <div className="notif-foot">
        <button onClick={() => { onSelect('reviews'); onClose() }} type="button">
          검토요청 전체 보기 →
        </button>
      </div>
    </div>
  )
}
