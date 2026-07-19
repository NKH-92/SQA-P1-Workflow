import { useEffect, useState } from 'react'

export function useCommandPalette(available: boolean) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!available) {
      setOpen(false)
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setOpen((value) => !value)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [available])

  return {
    open,
    close: () => setOpen(false),
    show: () => setOpen(true),
  }
}
