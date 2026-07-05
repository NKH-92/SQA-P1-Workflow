import type { ReactNode } from 'react'

export function IconAction({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button className="icon-button small" title={title} onClick={onClick} type="button">
      {children}
    </button>
  )
}
