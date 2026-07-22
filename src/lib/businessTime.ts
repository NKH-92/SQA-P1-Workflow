// D-02: business day/year boundaries are Asia/Seoul regardless of the host
// device or DB session timezone. The SQL counterparts (private.sqa_business_date
// / private.sqa_business_year in supabase/migrations/20260720100000_business_timezone_contract.sql)
// must stay in lock-step with this contract so number generation and stats
// filters agree between the browser, the local preview, and Postgres.
export const BUSINESS_TIME_ZONE = 'Asia/Seoul'

export type BusinessDateParts = {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  second: number
}

const businessDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})

export function businessDateParts(instant: Date): BusinessDateParts {
  if (Number.isNaN(instant.getTime())) throw new RangeError('Invalid business-time instant')
  const parts = Object.fromEntries(
    businessDateTimeFormatter.formatToParts(instant)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)]),
  )
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
  }
}

export function businessDateKey(instant: Date): string {
  const { year, month, day } = businessDateParts(instant)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export function businessYear(instant: Date): number {
  return businessDateParts(instant).year
}
