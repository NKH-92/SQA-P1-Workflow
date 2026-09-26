/**
 * 첫 화면을 그린 뒤 브라우저가 한가할 때 필요한 코드 조각을 미리 받아 둔다.
 * 첫 화면 번들은 가볍게 유지하면서, 사용자가 처음 열 때 기다리지 않게 한다. 정리 함수를 돌려준다.
 */
export function prefetchWhenIdle(load: () => Promise<unknown>, fallbackDelayMs = 1500): () => void {
  if (typeof window === 'undefined') return () => {}
  const run = () => {
    load().catch(() => {
      // 미리 받기 실패는 무시한다. 실제로 열 때 다시 받는다.
    })
  }
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: fallbackDelayMs * 2 })
    return () => window.cancelIdleCallback(handle)
  }
  const timer = window.setTimeout(run, fallbackDelayMs)
  return () => window.clearTimeout(timer)
}
