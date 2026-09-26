import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHashNavigation, useSelectionHashSync } from './useHashNavigation'

describe('useHashNavigation', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '#/dashboard')
    vi.restoreAllMocks()
  })

  it('replaces history when sanitizing a role-inaccessible deep link', async () => {
    window.history.replaceState(null, '', '#/review-stats')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const { result } = renderHook(() => useHashNavigation(false, true))

    await waitFor(() => expect(result.current.activeTab).toBe('dashboard'))
    expect(replaceState).toHaveBeenCalledWith(null, '', '#/dashboard')
  })

  it('keeps user-driven authorized navigation on the normal hash push path', () => {
    window.history.replaceState(null, '', '#/dashboard')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useHashNavigation(false, true))
    replaceState.mockClear()

    act(() => result.current.setActiveTab('reviews'))

    expect(window.location.hash).toBe('#/reviews')
    expect(result.current.activeTab).toBe('reviews')
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('keeps an announcement detail deep link available to members', () => {
    window.history.replaceState(null, '', '#/announcements?id=notice-1')

    const { result } = renderHook(() => useHashNavigation(false, true))

    expect(result.current.activeTab).toBe('announcements')
    expect(result.current.navEntityId).toBe('notice-1')
    expect(window.location.hash).toBe('#/announcements?id=notice-1')
  })

  it('exposes a safe dashboard immediately when a loaded member lands on the leader statistics hash', () => {
    window.history.replaceState(null, '', '#/review-stats?id=private-user')

    const { result } = renderHook(() => useHashNavigation(false, true))

    expect(result.current.activeTab).toBe('dashboard')
    expect(result.current.navEntityId).toBeNull()
  })

  it('blocks a direct member navigation call to review statistics before writing the hash', () => {
    window.history.replaceState(null, '', '#/dashboard')
    const { result } = renderHook(() => useHashNavigation(false, true))

    act(() => result.current.setActiveTab('review-stats', 'private-id'))

    expect(result.current.activeTab).toBe('dashboard')
    expect(result.current.navEntityId).toBeNull()
    expect(window.location.hash).toBe('#/dashboard')
  })

  it('allows a leader to navigate directly to review statistics', () => {
    window.history.replaceState(null, '', '#/dashboard')
    const { result } = renderHook(() => useHashNavigation(true, true))

    act(() => result.current.setActiveTab('review-stats'))

    expect(result.current.activeTab).toBe('review-stats')
    expect(window.location.hash).toBe('#/review-stats')
  })

  it('clears an inaccessible entity id when a hashchange is sanitized', async () => {
    window.history.replaceState(null, '', '#/dashboard')
    const { result } = renderHook(() => useHashNavigation(false, true))

    act(() => {
      window.history.replaceState(null, '', '#/review-stats?id=private-user')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    await waitFor(() => expect(result.current.activeTab).toBe('dashboard'))
    expect(result.current.navEntityId).toBeNull()
    expect(window.location.hash).toBe('#/dashboard')
  })

  it('replaces the current entry instead of pushing when asked (drawer navigation)', () => {
    window.history.replaceState({ __sqaOverlays: ['drawer'] }, '', '#/dashboard')
    const { result } = renderHook(() => useHashNavigation(true, true))
    const length = window.history.length

    act(() => result.current.setActiveTab('announcements', undefined, { replace: true }))

    expect(result.current.activeTab).toBe('announcements')
    expect(window.location.hash).toBe('#/announcements')
    expect(window.history.length).toBe(length)
    expect(window.history.state).toBeNull()
  })
})

describe('useHashNavigation with open dialogs and details', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '#/dashboard')
    vi.restoreAllMocks()
  })

  it('replaces the dialog history entry when navigating from inside it, so one Back returns to the previous screen', () => {
    window.history.replaceState(null, '', '#/reviews')
    const { result } = renderHook(() => useHashNavigation(true, true))
    window.history.pushState({ __sqaOverlays: ['overlay-palette'] }, '', '#/reviews')
    const pushState = vi.spyOn(window.history, 'pushState')

    act(() => result.current.setActiveTab('announcements'))

    expect(window.location.hash).toBe('#/announcements')
    expect(window.history.state).toBeNull()
    expect(pushState).not.toHaveBeenCalled()
  })

  it('does not treat the selection written back after closing a dialog as a new deep link', () => {
    window.history.replaceState(null, '', '#/change-applications')
    const { result } = renderHook(() => useHashNavigation(true, true))
    const { rerender } = renderHook(({ id }) => useSelectionHashSync('change-applications', id), {
      initialProps: { id: 'history-1' as string | null },
    })
    rerender({ id: 'history-1' })

    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(result.current.activeTab).toBe('change-applications')
    expect(result.current.navEntityId).toBeNull()
  })
})

describe('useSelectionHashSync', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '#/dashboard')
  })

  it('mirrors the selected item into ?id= and removes it when nothing is selected', () => {
    window.history.replaceState(null, '', '#/reviews?id=deep-link')
    const { rerender } = renderHook(({ id }: { id: string | null | undefined }) => useSelectionHashSync('reviews', id), {
      initialProps: { id: undefined as string | null | undefined },
    })
    expect(window.location.hash).toBe('#/reviews?id=deep-link')

    rerender({ id: 'review-2' })
    expect(window.location.hash).toBe('#/reviews?id=review-2')

    rerender({ id: null })
    expect(window.location.hash).toBe('#/reviews')
  })
})
