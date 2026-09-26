import { useEffect, useId, useRef } from 'react'
import { OVERLAY_HISTORY_KEY, overlayTokensIn, restoreLatestEntityHash } from '../lib/navigation'

/** 지금 열려 있는 오버레이 토큰. StrictMode 재실행처럼 곧바로 다시 열린 경우를 구분한다. */
const openTokens = new Set<string>()

/** 스스로 되돌린 기록의 popstate가 오지 않을 때 기다리는 최대 시간 */
const POP_WAIT_MS = 1000

let popTimer: number | null = null
let popInFlight = false

/**
 * 닫힌 오버레이가 쌓아 둔 기록을 한 번에 되돌린다. 여러 창이 함께 닫히거나 부모 창이 먼저 닫혀도
 * 맨 위부터 닫힌 만큼만 되돌리므로, 낡은 기록이 남아 다음 뒤로가기가 헛돌지 않는다.
 * 되돌린 뒤에는 그 사이 바뀐 선택(?id=)을 주소에 다시 써 넣는다.
 */
function popClosedLayers() {
  if (popTimer != null || typeof window === 'undefined') return
  popTimer = window.setTimeout(() => {
    popTimer = null
    if (popInFlight) return
    const stack = overlayTokensIn(window.history.state)
    let closed = 0
    while (closed < stack.length && !openTokens.has(stack[stack.length - 1 - closed])) closed += 1
    if (closed === 0) return
    popInFlight = true
    const settle = (event?: PopStateEvent) => {
      if (!popInFlight) return
      popInFlight = false
      window.removeEventListener('popstate', settle)
      if (event) restoreLatestEntityHash()
    }
    window.addEventListener('popstate', settle)
    window.setTimeout(() => settle(), POP_WAIT_MS)
    window.history.go(-closed)
  }, 0)
}

/**
 * open인 동안 같은 주소의 기록을 하나 더 쌓아 뒤로가기(안드로이드 뒤로 제스처 포함)가 화면을 떠나기보다
 * 열린 창·서랍·상세부터 닫게 한다(토스 DP-2·NV-3). 모든 기기에서 같은 규칙을 쓴다.
 * - onBack이 false를 돌려주면(작성 중이라 닫기 확인을 띄운 경우) 기록을 다시 쌓아 오버레이를 유지한다.
 * - 닫기·Esc·제출처럼 다른 방법으로 닫히면 쌓아 둔 기록을 되돌려, 다음 뒤로가기가 헛돌지 않게 한다.
 * - 되돌린 뒤에는 그 사이 바뀐 선택(?id=)을 주소에 다시 써 넣는다(restoreLatestEntityHash).
 * 해시 라우터는 hashchange만 듣기 때문에 같은 주소의 pushState는 탭 이동을 일으키지 않는다.
 * 창 안에서 다른 화면으로 옮기면 useHashNavigation이 이 기록을 바꿔 쓰므로 빈 기록이 남지 않는다.
 */
export function useHistoryLayer(open: boolean, onBack: () => boolean | void, enabled = true) {
  const onBackRef = useRef(onBack)
  const token = `overlay-${useId()}`

  useEffect(() => {
    onBackRef.current = onBack
  })

  useEffect(() => {
    if (!open || !enabled || typeof window === 'undefined') return
    const push = () => {
      const base = window.history.state && typeof window.history.state === 'object'
        ? (window.history.state as Record<string, unknown>)
        : {}
      window.history.pushState(
        { ...base, [OVERLAY_HISTORY_KEY]: [...overlayTokensIn(base), token] },
        '',
        window.location.href,
      )
    }
    openTokens.add(token)
    if (!overlayTokensIn(window.history.state).includes(token)) push()

    const onPopState = (event: PopStateEvent) => {
      // 더 위에 열린 오버레이가 닫힌 경우이거나, 스스로 되돌리는 중이면 이 오버레이는 그대로 둔다.
      if (popInFlight || overlayTokensIn(event.state).includes(token)) return
      restoreLatestEntityHash()
      if (onBackRef.current() === false) push()
    }
    window.addEventListener('popstate', onPopState)
    return () => {
      window.removeEventListener('popstate', onPopState)
      openTokens.delete(token)
      popClosedLayers()
    }
  }, [open, enabled, token])
}
