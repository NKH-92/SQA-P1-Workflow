import { useCallback, useEffect, useState } from 'react'

export function useCommandPalette(available: boolean) {
  const [open, setOpen] = useState(false)
  const hasBlockingModal = useCallback(
    () => typeof document !== 'undefined'
      && document.querySelector('[role="dialog"][aria-modal="true"]') !== null,
    [],
  )

  useEffect(() => {
    if (!available) {
      setOpen(false)
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (!open && hasBlockingModal()) return
        setOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [available, hasBlockingModal, open])

  const close = useCallback(() => setOpen(false), [])
  const show = useCallback(() => {
    if (!available || hasBlockingModal()) return
    setOpen(true)
  }, [available, hasBlockingModal])

  return {
    open,
    close,
    show,
  }
}
