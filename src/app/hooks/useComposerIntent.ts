import { useEffect, useRef } from 'react'
import {
  COMPOSER_INTENT_EVENT,
  consumeComposerRequest,
  type ComposerIntentTab,
} from '../../lib/navigation'

/**
 * 홈의 ‘검토요청 쓰기’, 빠른 이동의 ‘새 공지 쓰기’처럼 다른 곳에서 작성 창을 열어 달라고 요청하면
 * 이 화면이 받아서 onOpen을 한 번 부른다. 화면이 새로 열릴 때는 남아 있는 요청을 꺼내고,
 * 이미 열려 있을 때는 이벤트로 받는다. enabled가 false면(작성 권한이 없으면) 요청을 무시한다.
 *
 * 예: useComposerIntent('reviews', () => openReviewComposer(), profile.role === 'member')
 */
export function useComposerIntent(tab: ComposerIntentTab, onOpen: () => void, enabled = true) {
  const onOpenRef = useRef(onOpen)
  useEffect(() => {
    onOpenRef.current = onOpen
  })

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    if (consumeComposerRequest(tab)) onOpenRef.current()
    const onRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: string }>).detail
      if (detail?.tab !== tab) return
      if (consumeComposerRequest(tab)) onOpenRef.current()
    }
    window.addEventListener(COMPOSER_INTENT_EVENT, onRequest)
    return () => window.removeEventListener(COMPOSER_INTENT_EVENT, onRequest)
  }, [enabled, tab])
}
