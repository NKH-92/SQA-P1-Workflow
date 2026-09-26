import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { requestComposer } from '../../lib/navigation'
import { useComposerIntent } from './useComposerIntent'

describe('useComposerIntent', () => {
  afterEach(() => {
    window.sessionStorage.clear()
  })

  it('opens the composer once when the screen mounts after a request', () => {
    requestComposer('reviews')
    const onOpen = vi.fn()

    const { rerender } = renderHook(() => useComposerIntent('reviews', onOpen))
    rerender()

    expect(onOpen).toHaveBeenCalledTimes(1)
    expect(window.sessionStorage.getItem('sqa.reviews.openComposer')).toBeNull()
  })

  it('opens the composer when a request arrives while the screen is already open', () => {
    const onOpen = vi.fn()
    renderHook(() => useComposerIntent('announcements', onOpen))
    expect(onOpen).not.toHaveBeenCalled()

    requestComposer('reviews')
    expect(onOpen).not.toHaveBeenCalled()

    requestComposer('announcements')
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('ignores requests when the viewer cannot create on this screen', () => {
    requestComposer('change-applications')
    const onOpen = vi.fn()
    renderHook(() => useComposerIntent('change-applications', onOpen, false))
    expect(onOpen).not.toHaveBeenCalled()
  })
})
