import { PRESENCE_TEXT, presenceSummary, type EffectivePresence } from '../../../data/validation/memberPresence'
import { businessDateKey } from '../../../lib/businessTime'
import { usePixelUi } from '../pixelUiContext'
import { PixelIcon } from './PixelIcon'

/**
 * 내 상태 단추(왼쪽 메뉴 아래·사무실 위 메뉴). 지금 상태를 보여 주고, 누르면 내 상태 창을 연다.
 * 사무실 화면 사용자는 도트 아이콘, 기존 화면 사용자는 기존 디자인의 색 점으로 상태를 알린다(첫 화면 번들도 가볍다).
 */
export function PresenceButton({
  current,
  onOpen,
  variant,
}: {
  current: EffectivePresence | null
  onOpen: () => void
  variant: 'sidebar' | 'hud'
}) {
  const pixel = usePixelUi()
  const kind = current?.kind
  const text = current ? presenceSummary(current, businessDateKey(new Date())) : '자리에 있음'
  return (
    <button
      aria-label={`내 상태: ${text}. 바꾸기`}
      className={`presence-button presence-button-${variant}`}
      data-kind={kind ?? 'present'}
      onClick={onOpen}
      title="내 상태 바꾸기"
      type="button"
    >
      {pixel.enabled ? <PixelIcon id={kind ?? 'present'} /> : <span aria-hidden="true" className="presence-dot" />}
      <span className="presence-button-label">{variant === 'hud' ? (kind ? PRESENCE_TEXT[kind].label : '자리에 있음') : text}</span>
    </button>
  )
}
