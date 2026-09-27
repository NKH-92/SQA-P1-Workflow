import { useCallback, useState, useSyncExternalStore } from 'react'
import { defaultHomeMode, PHONE_MAX_WIDTH, readHomeMode, writeHomeMode, type HomeMode } from '../../lib/homeMode'

const PHONE_QUERY = `(max-width: ${PHONE_MAX_WIDTH}px)`

function subscribePhone(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(PHONE_QUERY)
  query.addEventListener?.('change', onChange)
  return () => query.removeEventListener?.('change', onChange)
}

function isPhone() {
  return typeof window.matchMedia === 'function' ? window.matchMedia(PHONE_QUERY).matches : window.innerWidth <= PHONE_MAX_WIDTH
}

/**
 * 홈 화면 방식(전체 화면 사무실 / 기존 화면). 사람마다 고른 것을 기억하고,
 * 고른 적이 없으면 데스크톱은 사무실, 휴대폰은 기존 화면이다.
 */
export function useHomeMode(profileId: string | null) {
  const phone = useSyncExternalStore(subscribePhone, isPhone, () => false)
  // 이번에 고른 값(사람별). 새로 로그인한 사람은 저장된 값을 읽는다.
  const [chosen, setChosen] = useState<Record<string, HomeMode>>({})
  const stored = profileId ? chosen[profileId] ?? readHomeMode(profileId) : null
  const mode: HomeMode = stored ?? defaultHomeMode(phone ? PHONE_MAX_WIDTH : PHONE_MAX_WIDTH + 1)

  const setMode = useCallback((next: HomeMode) => {
    if (!profileId) return
    writeHomeMode(profileId, next)
    setChosen((current) => ({ ...current, [profileId]: next }))
  }, [profileId])

  return { mode, setMode }
}
