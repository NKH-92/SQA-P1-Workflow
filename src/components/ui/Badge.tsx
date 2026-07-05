import type { ReactNode } from 'react'

export function Badge({ children, status }: { children: ReactNode; status?: string }) {
  return (
    <span className="badge" data-status={status}>
      {children}
    </span>
  )
}
