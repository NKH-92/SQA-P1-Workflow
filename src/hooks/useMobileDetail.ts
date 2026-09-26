import { useEffect, useRef, type RefObject } from 'react'
import { preferredScrollBehavior } from '../lib/motion'
import { useHistoryLayer } from './useHistoryLayer'

export const MOBILE_DETAIL_QUERY = '(max-width: 980px)'

export function isMobileDetailViewport() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia(MOBILE_DETAIL_QUERY).matches
}

/**
 * 좁은 화면의 목록→상세 공통 동작.
 * - open이 true가 되면(사용자가 항목을 골랐을 때) 상세를 화면 위로 가져오고 제목에 포커스를 준다.
 * - 뒤로가기(안드로이드 제스처 포함)는 화면을 떠나지 않고 onBack으로 목록에 돌아간다.
 * open은 ‘모바일에서 상세를 연 상태’를 뜻한다. 데스크톱 기본 선택과 구분해서 넘긴다.
 */
export function useMobileDetail({
  open,
  detailRef,
  onBack,
  selectionKey,
  headingSelector = '[data-detail-title], h2, h3',
}: {
  open: boolean
  detailRef: RefObject<HTMLElement | null>
  onBack: () => void
  /** 같은 상세 안에서 다른 항목으로 바뀔 때도 다시 보여주도록 선택 id를 넘긴다. */
  selectionKey?: string | null
  headingSelector?: string
}) {
  const frameRef = useRef<number | null>(null)
  const narrow = open && isMobileDetailViewport()

  useHistoryLayer(narrow, onBack, narrow)

  useEffect(() => {
    if (!narrow) return
    let remaining = 3
    const reveal = () => {
      const detail = detailRef.current
      if (!detail && remaining > 0) {
        remaining -= 1
        frameRef.current = window.requestAnimationFrame(reveal)
        return
      }
      frameRef.current = null
      if (!detail) return
      detail.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' })
      const heading = detail.querySelector<HTMLElement>(headingSelector)
      if (heading) {
        if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
        heading.focus({ preventScroll: true })
      }
    }
    frameRef.current = window.requestAnimationFrame(reveal)
    return () => {
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current)
    }
  }, [detailRef, headingSelector, narrow, selectionKey])
}
