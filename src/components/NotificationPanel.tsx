import { useEffect, useId, useRef } from 'react'
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
  /** 새 검토요청을 처리할 수 있는 파트장에게만 내려온다 — 데스크톱 알림 토글. */
  desktopNotifications?: DesktopNotificationControls
  onClose: () => void
  onMarkAllRead: () => void
  onSelect: (tab: TabId, entityId?: string) => void
}) {
  const panelRef = useRef<HTMLDivElement>(null)
  const newsHeadingId = useId()
  const reminderHeadingId = useId()
  const news = notifications.filter((item) => item.section === 'news')
  const reminders = notifications.filter((item) => item.section === 'reminder')
  const unread = news.filter((item) => item.unread).length

  // 열리면 패널로 포커스를 옮겨 키보드로 바로 항목을 고를 수 있게 한다.
  useEffect(() => {
    panelRef.current?.focus({ preventScroll: true })
  }, [])

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

  const renderItem = (item: AppNotification) => (
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
        <p>
          {item.unread && <span className="sr-only">읽지 않음, </span>}
          {item.title}
        </p>
        <small>
          {item.when} · {item.kind}
        </small>
      </span>
    </button>
  )

  return (
    <div className="notif-panel" ref={panelRef} role="dialog" aria-label="알림" tabIndex={-1}>
      <div className="notif-head">
        <h2 className="notif-title">
          <Bell size={15} aria-hidden="true" />
          알림
          {unread > 0 && <span className="n" aria-label={`읽지 않은 소식 ${unread}건`}>{unread}</span>}
        </h2>
        {unread > 0 && (
          <button className="mark-all" onClick={onMarkAllRead} type="button">
            모두 읽음
          </button>
        )}
      </div>
      <div className="notif-list">
        {notifications.length === 0 && <p className="notif-empty">새 알림이 없어요</p>}
        {news.length > 0 && (
          <section aria-labelledby={newsHeadingId} className="notif-section">
            <h3 className="notif-section-label" id={newsHeadingId}>새 소식</h3>
            {news.map(renderItem)}
          </section>
        )}
        {reminders.length > 0 && (
          <section aria-labelledby={reminderHeadingId} className="notif-section">
            <h3 className="notif-section-label" id={reminderHeadingId}>확인할 일</h3>
            {reminders.map(renderItem)}
          </section>
        )}
      </div>
      {desktopNotifications?.supported && (
        <div className="notif-pref">
          <label>
            <input
              checked={desktopNotifications.enabled}
              onChange={() => void desktopNotifications.toggle()}
              type="checkbox"
            />
            <Monitor size={13} aria-hidden="true" />새 검토요청을 데스크톱 알림으로 받기
          </label>
          <small>새 검토요청이 오면 다른 창을 보고 있어도 알림이 떠요.</small>
          {desktopNotifications.permission === 'denied' && (
            <small>브라우저에서 이 사이트 알림을 막아 두었어요. 주소창의 자물쇠 아이콘에서 알림을 허용한 뒤 다시 켜 주세요.</small>
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
              <small>잠금화면에도 보일 수 있어서 처음에는 검토 제목을 숨겨 두었어요.</small>
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
