import { businessDateKey } from '../../lib/businessTime'
import { dateOnlyTime } from '../../lib/dates'
import { formatDate, formatMonthDay } from '../../lib/format'

export type DateQuickPick = {
  /** 버튼에 보이는 짧은 이름. 예: ‘7일 후’, ‘+14일’ */
  label: string
  /** 기준일에서 더할 일수 */
  days: number
}

/** 기준일(YYYY-MM-DD)에 일수를 더한 날짜. 기준일이 올바르지 않으면 null. */
function addDaysToDateKey(base: string, days: number): string | null {
  const time = dateOnlyTime(base)
  if (time == null) return null
  return new Date(time + days * 86400000).toISOString().slice(0, 10)
}

/** 업무 기준 시간대(Asia/Seoul)의 오늘 날짜. 자정 직후에 어제 날짜가 찍히지 않게 한다. */
function todayDateKey(now = new Date()): string {
  return businessDateKey(now)
}

/**
 * 날짜 칸 옆의 빠른 선택 칩. 자주 쓰는 기한을 한 번에 고르게 해 입력 시간을 줄인다.
 * 날짜 입력 칸을 대신하지 않는다 — 칩은 칸의 값을 채울 뿐이고, 직접 입력도 그대로 된다.
 * baseDate가 비어 있으면 오늘을 기준으로 삼고, caption으로 무엇이 기준인지 알려 준다.
 */
export function DateQuickPicks({
  label,
  options,
  value,
  onSelect,
  baseDate,
  caption,
}: {
  /** 칩 묶음의 접근 가능한 이름. 예: ‘적용 기한 빠른 선택’ */
  label: string
  options: DateQuickPick[]
  /** 지금 칸에 들어 있는 날짜(YYYY-MM-DD) */
  value: string
  onSelect: (date: string) => void
  /** 더하기 기준일(YYYY-MM-DD). 비우면 오늘. */
  baseDate?: string | null
  /** 칩 아래 짧은 안내. 예: ‘시행일 기준’ */
  caption?: string
}) {
  const base = baseDate && dateOnlyTime(baseDate) != null ? baseDate : todayDateKey()
  return (
    <div className="date-quick-picks">
      <div aria-label={label} className="date-quick-picks-row" role="group">
        {options.map((option) => {
          const date = addDaysToDateKey(base, option.days)
          if (!date) return null
          const selected = value === date
          return (
            <button
              aria-label={`${option.label} · ${formatDate(date)}`}
              aria-pressed={selected}
              className={selected ? 'selected' : undefined}
              key={option.label}
              onClick={() => onSelect(date)}
              type="button"
            >
              <span>{option.label}</span>
              <small>{formatMonthDay(date)}</small>
            </button>
          )
        })}
      </div>
      {caption && <small className="date-quick-picks-caption">{caption}</small>}
    </div>
  )
}
