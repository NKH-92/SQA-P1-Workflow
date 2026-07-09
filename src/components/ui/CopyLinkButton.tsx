import { useEffect, useRef, useState } from 'react'
import { Check, Link2, X } from 'lucide-react'
import type { TabId } from '../../lib/navigation'
import { buildShareUrl } from '../../lib/navigation'
import { copyTextToClipboard } from '../../lib/clipboard'

type CopyState = 'idle' | 'copied' | 'failed'

/** 상세 항목의 공유 딥링크를 클립보드에 복사한다. 피드백은 버튼 라벨 전환으로 준다. */
export function CopyLinkButton({ tab, entityId }: { tab: TabId; entityId: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const resetTimerRef = useRef<number | null>(null)

  useEffect(
    () => () => {
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  const copy = async () => {
    const url = buildShareUrl(tab, entityId)
    const copied = await copyTextToClipboard(url)
    if (!copied) {
      // 클립보드가 정책으로 막힌 환경 — 수동 복사라도 가능하게 링크를 보여준다.
      window.prompt('자동 복사가 차단되어 있습니다. 아래 링크를 직접 복사하세요.', url)
    }
    setState(copied ? 'copied' : 'failed')
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current)
    resetTimerRef.current = window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <button
      className="ghost compact copy-link"
      data-state={state}
      onClick={() => void copy()}
      title="이 항목의 링크를 복사해 메신저에 붙여넣을 수 있습니다."
      type="button"
    >
      {state === 'copied' ? <Check size={14} /> : state === 'failed' ? <X size={14} /> : <Link2 size={14} />}
      {state === 'copied' ? '복사됨' : state === 'failed' ? '복사 실패' : '링크 복사'}
    </button>
  )
}
