import type { ReactNode } from 'react'

/** 빈 상태 표준형(DESIGN.md §5): 아이콘 + 한 줄 설명 + (선택) 행동 버튼. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="empty-state">
      {icon}
      <p>{title}</p>
      {description && <small>{description}</small>}
      {action}
    </div>
  )
}
