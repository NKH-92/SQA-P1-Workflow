import type { ReactNode } from 'react'

/**
 * 아이콘만 있는 작은 버튼. 보조기기와 터치 기기에서도 이름을 알 수 있게 aria-label을 늘 준다.
 * 같은 버튼이 여러 행에 반복되면 label에 대상 이름을 넣는다. 예: ‘자사제품 A 삭제’
 */
export function IconAction({
  title,
  label,
  onClick,
  children,
}: {
  title: string
  label?: string
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button aria-label={label ?? title} className="icon-button small" title={title} onClick={onClick} type="button">
      {children}
    </button>
  )
}
