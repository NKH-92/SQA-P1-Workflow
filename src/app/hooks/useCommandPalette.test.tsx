import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useCommandPalette } from './useCommandPalette'

let blockingDialog: HTMLElement | null = null

afterEach(() => {
  blockingDialog?.remove()
  blockingDialog = null
})

function dispatchCommandShortcut() {
  const event = new KeyboardEvent('keydown', {
    key: 'k',
    ctrlKey: true,
    cancelable: true,
  })
  window.dispatchEvent(event)
  return event
}

describe('useCommandPalette modal ownership', () => {
  it('does not open from Ctrl+K or show() while another modal is active', () => {
    blockingDialog = document.createElement('section')
    blockingDialog.setAttribute('role', 'dialog')
    blockingDialog.setAttribute('aria-modal', 'true')
    document.body.append(blockingDialog)
    const { result } = renderHook(() => useCommandPalette(true))

    let shortcut!: KeyboardEvent
    act(() => {
      shortcut = dispatchCommandShortcut()
    })
    expect(shortcut.defaultPrevented).toBe(true)
    expect(result.current.open).toBe(false)

    act(() => result.current.show())
    expect(result.current.open).toBe(false)

    blockingDialog.remove()
    blockingDialog = null
    act(() => {
      dispatchCommandShortcut()
    })
    expect(result.current.open).toBe(true)
  })
})
