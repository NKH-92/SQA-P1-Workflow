import { useEffect, useRef, useState } from 'react'
import { Check, Link2 } from 'lucide-react'
import type { TabId } from '../../lib/navigation'
import { buildShareUrl } from '../../lib/navigation'
import { copyTextToClipboard } from '../../lib/clipboard'

type CopyState = 'idle' | 'copied' | 'manual'

/**
 * 상세 항목의 공유 딥링크를 클립보드에 복사한다. 결과는 버튼 글자로 알려준다.
 * 브라우저 정책으로 복사가 막히면 창을 띄우는 대신 바로 옆에 선택된 링크를 보여줘 직접 복사하게 한다.
 */
export function CopyLinkButton({ tab, entityId }: { tab: TabId; entityId: string }) {
  const [state, setState] = useState<CopyState>('idle')
  const [url, setUrl] = useState('')
  const resetTimerRef = useRef<number | null>(null)
  const manualRef = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (state !== 'manual') return
    manualRef.current?.focus()
    manualRef.current?.select()
  }, [state])

  const copy = async () => {
    const nextUrl = buildShareUrl(tab, entityId)
    setUrl(nextUrl)
    const copied = await copyTextToClipboard(nextUrl)
    if (resetTimerRef.current != null) window.clearTimeout(resetTimerRef.current)
    if (!copied) {
      setState('manual')
      return
    }
    setState('copied')
    resetTimerRef.current = window.setTimeout(() => setState('idle'), 2000)
  }

  return (
    <span className="copy-link-wrap">
      <button
        className="ghost compact copy-link"
        data-state={state}
        onClick={() => void copy()}
        type="button"
      >
        {state === 'copied' ? <Check aria-hidden="true" size={14} /> : <Link2 aria-hidden="true" size={14} />}
        {state === 'copied' ? '복사했어요' : '링크 복사'}
      </button>
      {state === 'manual' && (
        <span className="copy-link-manual" role="status">
          <small>자동 복사가 막혀 있어요. 아래 링크를 직접 복사해 주세요.</small>
          <input
            ref={manualRef}
            aria-label="공유 링크"
            onBlur={() => setState('idle')}
            readOnly
            value={url}
          />
        </span>
      )}
    </span>
  )
}
