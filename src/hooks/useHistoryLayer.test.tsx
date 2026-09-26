import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replaceHashEntityId } from '../lib/navigation'
import { useHistoryLayer } from './useHistoryLayer'

function Layer({ open, onBack }: { open: boolean; onBack: () => boolean | void }) {
  useHistoryLayer(open, onBack)
  return null
}

function Layers({ outer, inner }: { outer: boolean; inner: boolean }) {
  return (
    <>
      <Layer open={outer} onBack={() => undefined} />
      <Layer open={inner} onBack={() => undefined} />
    </>
  )
}

const overlays = () => (window.history.state?.__sqaOverlays ?? []) as string[]

let go: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.useFakeTimers()
  window.history.replaceState(null, '', '#/reviews?id=first')
  // 실제 기록 이동은 브라우저가 비동기로 하므로, 호출만 확인하고 popstate는 테스트가 직접 보낸다.
  go = vi.spyOn(window.history, 'go').mockImplementation(() => undefined)
})

afterEach(() => {
  cleanup()
  vi.runAllTimers()
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('useHistoryLayer', () => {
  it('adds one history entry while open so Back closes the layer first', () => {
    const onBack = vi.fn()
    render(<Layer open onBack={onBack} />)
    expect(overlays()).toHaveLength(1)

    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('re-adds the entry when the layer refuses to close (unsaved input)', () => {
    render(<Layer open onBack={() => false} />)
    const pushState = vi.spyOn(window.history, 'pushState')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(pushState).toHaveBeenCalledTimes(1)
  })

  it('removes its entry when closed another way (button, Esc, submit)', () => {
    const { rerender } = render(<Layer open onBack={() => undefined} />)
    rerender(<Layer open={false} onBack={() => undefined} />)
    act(() => {
      vi.runOnlyPendingTimers()
    })
    expect(go).toHaveBeenCalledWith(-1)
  })

  it('removes nested entries in one step when the outer layer closes before the inner one', () => {
    const { rerender } = render(<Layers outer inner />)
    expect(overlays()).toHaveLength(2)
    rerender(<Layers outer={false} inner />)
    rerender(<Layers outer={false} inner={false} />)
    act(() => {
      vi.runOnlyPendingTimers()
    })
    expect(go).toHaveBeenCalledTimes(1)
    expect(go).toHaveBeenCalledWith(-2)
  })

  it('keeps the latest selection in the address after the layer entry is removed', () => {
    const { rerender } = render(<Layer open onBack={() => undefined} />)
    // 창이 열린 동안 새 항목을 골랐다(예: 새 공지를 올린 뒤 그 공지를 선택).
    replaceHashEntityId('reviews', 'second')
    rerender(<Layer open={false} onBack={() => undefined} />)
    act(() => {
      vi.runOnlyPendingTimers()
    })
    // 기록을 되돌리면 주소가 창을 열기 전 값으로 돌아간다(브라우저 동작을 흉내 낸다).
    window.history.replaceState(null, '', '#/reviews?id=first')
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: null }))
    })
    expect(window.location.hash).toBe('#/reviews?id=second')
  })
})
