import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  )
}

export function Modal({
  open,
  onClose,
  title,
  titleId,
  description,
  eyebrow,
  icon,
  closeLabel,
  className = 'master-modal',
  initialFocusRef,
  returnFocusRef,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  titleId?: string
  description?: string
  eyebrow?: string
  icon?: ReactNode
  closeLabel?: string
  className?: string
  initialFocusRef?: RefObject<HTMLElement>
  returnFocusRef?: RefObject<HTMLElement>
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  children: ReactNode
}) {
  const generatedTitleId = useId()
  const resolvedTitleId = titleId ?? generatedTitleId
  const descriptionId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const lastFocusedRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    lastFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      if (initialFocusRef?.current) {
        initialFocusRef.current.focus()
        return
      }
      const dialog = dialogRef.current
      if (!dialog) return
      const focusable = getFocusableElements(dialog)
      focusable[0]?.focus()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open, initialFocusRef])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !dialogRef.current) return
      const focusable = getFocusableElements(dialogRef.current)
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, closeOnEscape])

  useEffect(() => {
    if (open) return
    const target = returnFocusRef?.current ?? lastFocusedRef.current
    target?.focus()
  }, [open, returnFocusRef])

  if (!open) return null

  return (
    <div
      className="modal-backdrop"
      onMouseDown={() => {
        if (closeOnBackdrop) onClose()
      }}
      role="presentation"
    >
      <section
        ref={dialogRef}
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={resolvedTitleId}
        aria-modal="true"
        className={`modal-card ${className}`}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-header">
          {icon && (
            <div className="modal-mark" aria-hidden="true">
              {icon}
            </div>
          )}
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            <h2 id={resolvedTitleId}>{title}</h2>
            {description && (
              <p className="modal-description" id={descriptionId}>
                {description}
              </p>
            )}
          </div>
          <button
            aria-label={closeLabel ?? '닫기'}
            className="icon-button modal-close"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  )
}
