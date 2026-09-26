import type { ReactNode } from 'react'
import { Badge } from './Badge'

export type RowItem = {
  title: string
  meta: string
  aside?: string
  /** aside 배지의 상태색(Badge data-status) */
  asideStatus?: string
  /** aside 앞에 붙는 보조 표시(기한 칩 등) */
  extra?: ReactNode
  action?: ReactNode
}

/**
 * 읽기용 행 목록. 행 자체는 누를 수 없으므로 누를 수 있는 것처럼 보이는 hover를 주지 않는다(LST-4).
 * 행에서 할 일이 있으면 action에 명시적인 버튼·링크를 둔다.
 * wrap을 주면 긴 이름도 말줄임 없이 줄바꿈해 모두 보여준다.
 */
export function Rows({
  rows,
  empty,
  wrap = false,
}: {
  rows: RowItem[]
  empty: string
  wrap?: boolean
}) {
  if (rows.length === 0) return <p className="empty">{empty}</p>
  return (
    <div className={wrap ? 'rows rows-static rows-wrap' : 'rows rows-static'}>
      {rows.map((row, index) => (
        <div className="row" key={`${row.title}-${index}`}>
          <div>
            <strong>{row.title}</strong>
            <span>{row.meta}</span>
          </div>
          {(row.extra || row.aside || row.action) && (
            <div className="row-side">
              {row.extra}
              {row.aside && <Badge status={row.asideStatus}>{row.aside}</Badge>}
              {row.action}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
