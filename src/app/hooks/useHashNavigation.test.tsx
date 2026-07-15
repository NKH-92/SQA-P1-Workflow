import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHashNavigation } from './useHashNavigation'

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
})
