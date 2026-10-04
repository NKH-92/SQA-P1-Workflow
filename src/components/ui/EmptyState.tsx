import { lazy, Suspense, type ReactNode } from 'react'
import { usePixelUi } from '../../features/office/pixelUiContext'
const EmptyArt = lazy(() => import('../../features/office/officeEmptyArt').then(m => ({ default: m.OfficeEmptyArt })))

/** 빈 상태 표준형(DESIGN.md §5): 아이콘 + 한 줄 설명 + (선택) 행동 버튼. */
export function EmptyState({
  icon,
  art,
  title,
  description,
  action,
}: {
  art?: 'desk' | 'tray' | 'board'
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  const pixel = usePixelUi()
  return (
    <div className="empty-state">
      {pixel.enabled && art ? <Suspense fallback={icon}><EmptyArt kind={art} /></Suspense> : icon}
      <p>{title}</p>
      {description && <small>{description}</small>}
      {action}
    </div>
  )
}
