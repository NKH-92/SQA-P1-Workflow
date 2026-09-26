import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { projectStatusLabels } from '../../../lib/format'
import type { ProjectStatus } from '../../../types'
import { PROJECT_STATUS_LIFECYCLE } from '../project.selectors'

/**
 * 카드에서 바로 프로젝트 상태를 바꾸는 작은 메뉴. 상태 배지처럼 보이는 버튼을 누르면
 * 예정·진행 중·완료 중 하나를 고른다. 닫힌 select처럼 방향키만 눌러도 저장되는 일이 없게
 * 메뉴에서 고른 순간에만 바꾼다. 키보드: Enter/Space로 열고 ↑↓로 이동, Esc로 닫는다.
 */
export function ProjectStatusMenu({
  projectName,
  status,
  disabled = false,
  onChange,
}: {
  projectName: string
  status: ProjectStatus
  disabled?: boolean
  onChange: (next: ProjectStatus) => void
}) {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const label = projectStatusLabels[status]

  useEffect(() => {
    if (!open) return
    const current = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')
    ;(current ?? menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"]'))?.focus()
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

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      close(true)
    } else if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[(index + 1) % items.length]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[(index - 1 + items.length) % items.length]?.focus()
    } else if (event.key === 'Tab') {
      close(false)
    }
  }

  return (
    <span className="project-status-menu">
      <button
        ref={buttonRef}
        aria-controls={open ? menuId : undefined}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${label}, ${projectName} 상태 바꾸기`}
        className="project-status-trigger badge"
        data-status={status}
        disabled={disabled}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {label}
        <ChevronDown aria-hidden="true" size={13} />
      </button>
      {open && (
        <div
          ref={menuRef}
          aria-label={`${projectName} 상태`}
          className="overflow-menu-list project-status-list"
          data-align="start"
          id={menuId}
          onKeyDown={onMenuKeyDown}
          role="menu"
        >
          {PROJECT_STATUS_LIFECYCLE.map((value) => (
            <button
              key={value}
              aria-checked={value === status}
              className="overflow-menu-item"
              onClick={() => {
                close(true)
                if (value !== status) onChange(value)
              }}
              role="menuitemradio"
              type="button"
            >
              <span className="project-status-check" aria-hidden="true">
                {value === status && <Check size={14} />}
              </span>
              <span>{projectStatusLabels[value]}</span>
            </button>
          ))}
        </div>
      )}
    </span>
  )
}
