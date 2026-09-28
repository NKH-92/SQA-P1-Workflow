import { act, cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OfficeScene } from './OfficeScene'

/** 그리기 결과는 보지 않고 그리기 반복의 예약만 확인하려고, 아무것도 하지 않는 2D 컨텍스트를 넣는다. */
function fakeContext(): CanvasRenderingContext2D {
  const noop = () => undefined
  return new Proxy({} as Record<string, unknown>, {
    get: (target, key) => (key in target ? target[key as string] : noop),
    set: (target, key, value) => {
      target[key as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
}

describe('office scene drawing loop', () => {
  let original: PropertyDescriptor | undefined
  let frames: FrameRequestCallback[] = []
  let hidden = false

  beforeEach(() => {
    frames = []
    hidden = false
    original = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, 'getContext')
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { configurable: true, writable: true, value: fakeContext })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'performance'] })
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback)
      return frames.length
    })
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined)
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.restoreAllMocks()
    Reflect.deleteProperty(document, 'hidden')
    if (original) Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', original)
  })

  /** 마지막으로 예약된 프레임을 지금 시각으로 돌린다. */
  const runFrame = () => {
    const callback = frames[frames.length - 1]
    act(() => callback(performance.now()))
  }

  it('waits for the next 10 fps slot with a timer instead of requesting a frame on every refresh', () => {
    const { unmount } = render(<OfficeScene currentProfileId="me" occupants={[]} />)
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)

    runFrame()
    // 그린 직후에는 프레임을 바로 다시 잡지 않고 남은 100ms를 기다린다.
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(99))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)
    act(() => vi.advanceTimersByTime(1))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2)

    runFrame()
    act(() => vi.advanceTimersByTime(100))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(3)

    unmount()
    expect(window.cancelAnimationFrame).toHaveBeenCalled()
  })

  it('drops the pending timer while the tab is hidden and resumes when it is shown again', () => {
    render(<OfficeScene currentProfileId="me" occupants={[]} />)
    runFrame()
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)

    hidden = true
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    act(() => vi.advanceTimersByTime(500))
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(1)

    hidden = false
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    // 이미 100ms가 지났으므로 기다리지 않고 바로 다음 프레임을 잡는다.
    expect(window.requestAnimationFrame).toHaveBeenCalledTimes(2)
  })
})
