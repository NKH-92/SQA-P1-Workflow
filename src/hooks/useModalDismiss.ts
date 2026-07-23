import { useEffect, useRef } from 'react'
import type { RefObject } from 'react'

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * 직접 마크업으로 만든 모달의 공통 동작: 열려 있는 동안 body 스크롤을 잠그고
 * Escape·focus trap·focus return을 제공한다. onClose는 참조가 안정적이어야 한다.
 */
export function useModalDismiss(
  open: boolean,
  onClose: () => void,
  dialogRef?: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const dialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
    const dialog = dialogRef?.current ?? dialogs[dialogs.length - 1]
    const focusable = () => dialog
      ? [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.tabIndex !== -1)
      : []
    const focusTimer = window.setTimeout(() => {
      if (!dialog?.contains(document.activeElement)) focusable()[0]?.focus()
    }, 0)
    const onKeyDown = (event: KeyboardEvent) => {
      const openDialogs = [...document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]')]
      if (!dialog || openDialogs[openDialogs.length - 1] !== dialog) return
      if (event.isComposing || event.keyCode === 229) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return
      const elements = focusable()
      if (elements.length === 0) return
      const first = elements[0]
      const last = elements[elements.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', onKeyDown)
    return () => {
      window.clearTimeout(focusTimer)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      if (trigger && document.contains(trigger)) trigger.focus()
    }
  }, [dialogRef, open])
}
