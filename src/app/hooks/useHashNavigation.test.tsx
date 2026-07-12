import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useHashNavigation } from './useHashNavigation'

describe('useHashNavigation', () => {
  afterEach(() => {
    window.history.replaceState(null, '', '#/dashboard')
    vi.restoreAllMocks()
  })

  it('replaces history when sanitizing a role-inaccessible deep link', async () => {
    window.history.replaceState(null, '', '#/team')
    const replaceState = vi.spyOn(window.history, 'replaceState')

    const { result } = renderHook(() => useHashNavigation(false, true))

    await waitFor(() => expect(result.current.activeTab).toBe('dashboard'))
    expect(replaceState).toHaveBeenCalledWith(null, '', '#/dashboard')
  })

  it('keeps user-driven navigation on the normal hash push path', () => {
    window.history.replaceState(null, '', '#/dashboard')
    const replaceState = vi.spyOn(window.history, 'replaceState')
    const { result } = renderHook(() => useHashNavigation(false, true))
    replaceState.mockClear()

    act(() => result.current.setActiveTab('reviews'))

    expect(window.location.hash).toBe('#/reviews')
    expect(replaceState).not.toHaveBeenCalled()
  })

  it('clears an inaccessible entity id when a hashchange is sanitized', async () => {
    window.history.replaceState(null, '', '#/dashboard')
    const { result } = renderHook(() => useHashNavigation(false, true))

    act(() => {
      window.history.replaceState(null, '', '#/team?id=private-user')
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    await waitFor(() => expect(result.current.activeTab).toBe('dashboard'))
    expect(result.current.navEntityId).toBeNull()
    expect(window.location.hash).toBe('#/dashboard')
  })
})
