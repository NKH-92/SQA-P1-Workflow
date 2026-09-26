import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'

export type OverflowMenuItem = {
  label: string
  onSelect: () => void
  icon?: ReactNode
  /** 삭제처럼 되돌리기 어려운 행동은 빨간 글자로 구분한다. */
  danger?: boolean
  disabled?: boolean
  /** 비활성일 때 이유(툴팁과 보조기기에 함께 전달) */
  disabledReason?: string
}

/**
 * 드물게 쓰거나 되돌리기 어려운 행동을 모아 두는 ‘더보기(⋯)’ 메뉴.
 * 카드·상세의 주요 행동은 하나만 드러내고 나머지는 여기로 옮긴다(토스 DP-5: 버튼만 보고 결과 예측).
 * 키보드: Enter/Space로 열고, ↑↓로 이동, Esc로 닫고 버튼에 포커스를 돌려준다.
 */
export function OverflowMenu({
  label,
  items,
  align = 'end',
}: {
  /** 버튼의 접근 가능한 이름. 대상 이름을 넣는다. 예: ‘자사제품 A 더보기’ */
  label: string
  items: OverflowMenuItem[]
  align?: 'start' | 'end'
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]:not([disabled])')
    firstItem?.focus()
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node
      if (menuRef.current?.contains(target) || buttonRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open])

  const close = (restoreFocus: boolean) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])') ?? [])
    const index = menuItems.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      menuItems[(index + 1) % menuItems.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      menuItems[(index - 1 + menuItems.length) % menuItems.length]?.focus()
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <span className="overflow-menu">
      <button
        ref={buttonRef}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        className="icon-button small overflow-menu-trigger"
        onClick={() => setOpen((value) => !value)}
        title={label}
        type="button"
      >
        <MoreHorizontal aria-hidden="true" size={16} />
      </button>
      {open && (
        <div
          ref={menuRef}
          aria-label={label}
          className="overflow-menu-list"
          data-align={align}
          id={menuId}
          onKeyDown={onMenuKeyDown}
          role="menu"
        >
          {items.map((item) => (
            <button
              key={item.label}
              aria-disabled={item.disabled || undefined}
              className={item.danger ? 'overflow-menu-item danger-text' : 'overflow-menu-item'}
              disabled={item.disabled}
              onClick={() => {
                close(false)
                item.onSelect()
              }}
              role="menuitem"
              title={item.disabled ? item.disabledReason : undefined}
              type="button"
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
