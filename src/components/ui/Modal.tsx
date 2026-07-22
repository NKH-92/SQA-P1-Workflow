import { useEffect, useId, useRef, type ReactNode, type RefObject } from 'react'
import { X } from 'lucide-react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Open-modal stack (bottom → top). Only the topmost modal owns Escape. */
const openModalStack: symbol[] = []

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => !element.hasAttribute('disabled') && element.tabIndex !== -1,
  )
}

function isSafeFocusTarget(element: HTMLElement | null | undefined): element is HTMLElement {
  return Boolean(element) && typeof element!.focus === 'function' && document.contains(element!)
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
  const triggerRef = useRef<HTMLElement | null>(null)
  const stackIdRef = useRef(Symbol('modal'))

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  // Captures the trigger element at the start of this open lifecycle, then
  // restores focus in the cleanup so every close path is covered: an
  // `open -> false` prop transition, an Escape/backdrop/submit-triggered
  // `onClose`, or the caller unmounting the Modal outright (e.g.
  // `{dialog && <Modal .../>}`). Cleanup runs for all of these because React
  // always runs the previous effect's cleanup before re-running it or on
  // unmount, regardless of whether the component stays mounted.
  useEffect(() => {
    if (!open) return
    triggerRef.current = (document.activeElement as HTMLElement | null) ?? null
    return () => {
      // Intentionally read `.current` fresh at close time rather than a
      // setup-time snapshot: the caller owns this ref and it must reflect
      // whatever it currently points to when the modal actually closes.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      const explicitTarget = returnFocusRef?.current
      const target = isSafeFocusTarget(explicitTarget)
        ? explicitTarget
        : isSafeFocusTarget(triggerRef.current)
          ? triggerRef.current
          : null
      target?.focus()
      triggerRef.current = null
    }
  }, [open, returnFocusRef])

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

  // Register in the open-modal stack so nested Escape only closes the topmost dialog.
  useEffect(() => {
    if (!open) return
    const id = stackIdRef.current
    openModalStack.push(id)
    return () => {
      const index = openModalStack.lastIndexOf(id)
      if (index >= 0) openModalStack.splice(index, 1)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      const isTopmost = openModalStack[openModalStack.length - 1] === stackIdRef.current
      if (!isTopmost) return

      if (event.key === 'Escape' && closeOnEscape) {
        event.preventDefault()
        event.stopPropagation()
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
    // Capture phase so the topmost modal sees Escape before ancestors/siblings.
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose, closeOnEscape])

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
