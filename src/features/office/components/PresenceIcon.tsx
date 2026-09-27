import { CircleCheck, Clock3, FlaskConical, HardHat, Luggage, MessagesSquare, TreePalm, type LucideIcon } from 'lucide-react'
import type { PixelIconId } from '../officePixelIcons'
import { usePixelUi } from '../pixelUiContext'
import { PixelIcon } from './PixelIcon'

const LINE_ICONS: Record<PixelIconId, LucideIcon> = {
  present: CircleCheck,
  meeting: MessagesSquare,
  field: HardHat,
  lab: FlaskConical,
  away: Clock3,
  vacation: TreePalm,
  trip: Luggage,
}

/**
 * 자리 상태 아이콘. 도트 디자인을 쓰는 사람에게는 사무실 자리 표지와 같은 도트 아이콘을,
 * 기존 화면을 쓰는 사람에게는 앱의 선 아이콘을 보여 준다(장식이라 보조기기에는 숨긴다).
 */
export function PresenceIcon({ id, className }: { id: PixelIconId; className?: string }) {
  const pixel = usePixelUi()
  if (pixel.enabled) return <PixelIcon className={className} id={id} />
  const Icon = LINE_ICONS[id]
  return <Icon aria-hidden="true" className={className ? `presence-line-icon ${className}` : 'presence-line-icon'} data-kind={id} />
}
