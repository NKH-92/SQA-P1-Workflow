import { useEffect } from 'react'

/**
 * 직접 마크업으로 만든 모달의 공통 동작: 열려 있는 동안 body 스크롤을 잠그고
 * Escape로 닫는다. onClose는 참조가 안정적이어야 한다(useCallback 권장).
 */
export function useModalDismiss(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open, onClose])
}
