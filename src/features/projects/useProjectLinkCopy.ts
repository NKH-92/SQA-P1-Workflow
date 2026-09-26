import { useCallback, useEffect, useRef, useState } from 'react'
import { copyTextToClipboard } from '../../lib/clipboard'
import { buildShareUrl } from '../../lib/navigation'

export type ProjectLinkCopyState =
  | { projectId: string; status: 'copied'; url: string }
  | { projectId: string; status: 'manual'; url: string }

const COPIED_VISIBLE_MS = 2500

/**
 * 카드 더보기(⋯) 메뉴의 ‘링크 복사’. 결과는 그 카드 안에 짧게 보여준다.
 * 브라우저가 자동 복사를 막으면 창을 띄우지 않고 카드 안에 선택된 링크 칸을 보여 직접 복사하게 한다.
 */
export function useProjectLinkCopy() {
  const [state, setState] = useState<ProjectLinkCopyState | null>(null)
  const timerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (timerRef.current != null) window.clearTimeout(timerRef.current)
    },
    [],
  )

  const copy = useCallback(async (projectId: string) => {
    const url = buildShareUrl('projects', projectId)
    const copied = await copyTextToClipboard(url)
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    if (!copied) {
      setState({ projectId, status: 'manual', url })
      return false
    }
    setState({ projectId, status: 'copied', url })
    timerRef.current = window.setTimeout(() => setState(null), COPIED_VISIBLE_MS)
    return true
  }, [])

  const dismiss = useCallback(() => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current)
    timerRef.current = null
    setState(null)
  }, [])

  return { state, copy, dismiss }
}
