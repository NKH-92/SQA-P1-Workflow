import { useEffect, useState } from 'react'
import { businessDateKey } from '../lib/businessTime'

/** 지금부터 서울 날짜가 처음 바뀌는 시각까지 남은 밀리초. */
export function millisecondsUntilNextBusinessDay(now: Date) {
  const currentKey = businessDateKey(now)
  const timestamp = now.getTime()
  let lower = 0
  let upper = 36 * 60 * 60 * 1000
  while (upper - lower > 1) {
    const middle = lower + Math.floor((upper - lower) / 2)
    if (businessDateKey(new Date(timestamp + middle)) === currentKey) lower = middle
    else upper = middle
  }
  return upper
}

/**
 * 화면의 ‘오늘’(서울 업무일 기준). 서울 날짜가 바뀔 때만 새 Date로 바뀌므로 useMemo 의존성으로 써도 흔들리지 않는다.
 * 탭을 밤새 열어 둔 경우 다음 서울 자정에 갱신하고, PC 절전 중에는 타이머가 제때 돌지 않으므로
 * 탭이 다시 보이거나(visibilitychange) 창에 포커스가 돌아올 때도 날짜가 바뀌었는지 확인한다.
 */
export function useBusinessToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    const todayKey = businessDateKey(today)
    let timer = 0
    const refreshIfDateChanged = () => {
      const current = new Date()
      if (businessDateKey(current) === todayKey) return false
      setToday(current)
      return true
    }
    const schedule = () => {
      timer = window.setTimeout(() => {
        // 타이머가 조금 일찍 돌아 아직 같은 날이면 다음 자정으로 다시 건다.
        if (!refreshIfDateChanged()) schedule()
      }, millisecondsUntilNextBusinessDay(new Date()))
    }
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshIfDateChanged()
    }
    const handleFocus = () => {
      refreshIfDateChanged()
    }

    // 렌더 뒤 effect가 늦게 도는 사이 날짜가 바뀌었을 수도 있으니 한 번 확인하고 시작한다.
    if (!refreshIfDateChanged()) schedule()
    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleFocus)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleFocus)
    }
  }, [today])

  return today
}
