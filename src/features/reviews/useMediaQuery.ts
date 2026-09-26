import { useEffect, useState } from 'react'

/** 휴대폰 폭: 상세의 처리 버튼을 화면 아래 고정 줄(.mobile-action-bar)로 옮기는 기준. */
export const REVIEW_COMPACT_QUERY = '(max-width: 640px)'

function matches(query: string) {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(query).matches
}

/** CSS 미디어 쿼리와 같은 기준을 화면 구성(버튼 위치 등)에도 쓰기 위한 작은 훅. */
export function useMediaQuery(query: string) {
  const [isMatch, setIsMatch] = useState(() => matches(query))

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const list = window.matchMedia(query)
    const update = () => setIsMatch(list.matches)
    update()
    if (typeof list.addEventListener === 'function') {
      list.addEventListener('change', update)
      return () => list.removeEventListener('change', update)
    }
    list.addListener(update)
    return () => list.removeListener(update)
  }, [query])

  return isMatch
}
