import type { ReactNode } from 'react'
import { Badge } from './Badge'

export function Rows({
  rows,
  empty,
}: {
  rows: Array<{ title: string; meta: string; aside?: string; action?: ReactNode }>
  empty: string
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>
  return (
    <div className="rows">
      {rows.map((row, index) => (
        <div className="row" key={`${row.title}-${index}`}>
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          <div className="row-side">
            {row.aside && <Badge>{row.aside}</Badge>}
            {row.action}
          </div>
        </div>
      ))}
    </div>
  )
}
