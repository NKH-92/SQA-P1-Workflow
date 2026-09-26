import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, Profile } from '../../types'

const user = { id: 'user-1' }
const profile: Profile = {
  id: user.id,
  email: 'user@example.com',
  name: 'User',
  role: 'member',
  is_active: true,
  must_change_password: false,
}
const profileState = vi.hoisted(() => ({ current: null as Profile | null }))

const authMocks = vi.hoisted(() => ({
  getSession: vi.fn(async () => ({ data: { session: { user } } })),
  getUser: vi.fn(async () => ({ data: { user }, error: null })),
  signOut: vi.fn(async () => ({ error: null })),
  unsubscribe: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  isPreviewMode: false,
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      getUser: authMocks.getUser,
      signOut: authMocks.signOut,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: authMocks.unsubscribe } } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: profileState.current, error: null })),
        })),
      })),
    })),
  },
}))

import { useAuthProfile } from './useAuthProfile'

describe('useAuthProfile retry', () => {
  afterEach(cleanup)

  beforeEach(() => {
    profileState.current = profile
    authMocks.getSession.mockClear()
    authMocks.getUser.mockClear()
    authMocks.signOut.mockClear()
  })

  it('retries the initial data load without discarding the valid session', async () => {
    const refreshData = vi
      .fn<(options?: { initial?: boolean }) => Promise<void>>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(undefined)
    const setData = vi.fn() as unknown as React.Dispatch<React.SetStateAction<AppData>>
    const setMessage = vi.fn()
    const resetNavigation = vi.fn()
    const resetSyncState = vi.fn()
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() =>
      useAuthProfile(refreshData, setData, setMessage, resetNavigation, resetSyncState),
    )

    await waitFor(() => expect(result.current.profileLoadError).toBeTruthy())
    expect(result.current.sessionUser).toEqual(user)

    act(() => result.current.retryProfileLoad())

    await waitFor(() => expect(result.current.profile).toEqual(profile))
    expect(result.current.profileLoadError).toBeNull()
    expect(refreshData).toHaveBeenCalledTimes(2)
    expect(authMocks.signOut).not.toHaveBeenCalled()
  })

  it('shows a password-pending profile without calling blocked app bootstraps', async () => {
    profileState.current = { ...profile, must_change_password: true }
    const refreshData = vi.fn<(options?: { initial?: boolean }) => Promise<void>>()
    const setData = vi.fn() as unknown as React.Dispatch<React.SetStateAction<AppData>>

    const { result } = renderHook(() =>
      useAuthProfile(refreshData, setData, vi.fn(), vi.fn(), vi.fn()),
    )

    await waitFor(() => expect(result.current.profile).toEqual(profileState.current))
    expect(result.current.profileLoadError).toBeNull()
    expect(refreshData).not.toHaveBeenCalled()
  })

  it('clears stale auth-phase messages once the profile loads', async () => {
    const setMessage = vi.fn()
    const { result } = renderHook(() =>
      useAuthProfile(vi.fn(async () => undefined), vi.fn() as unknown as React.Dispatch<React.SetStateAction<AppData>>, setMessage, vi.fn(), vi.fn()),
    )

    await waitFor(() => expect(result.current.profile).toEqual(profile))
    expect(setMessage).toHaveBeenCalledWith(null)
    expect(setMessage).not.toHaveBeenCalledWith(expect.objectContaining({ tone: 'error' }))
  })

  it('keeps saved review drafts but clears screen view state on sign-out', async () => {
    const { result } = renderHook(() =>
      useAuthProfile(vi.fn(async () => undefined), vi.fn() as unknown as React.Dispatch<React.SetStateAction<AppData>>, vi.fn(), vi.fn(), vi.fn()),
    )
    await waitFor(() => expect(result.current.profile).toEqual(profile))
    const draftKey = `draft:review:v2:${profile.id}`
    window.localStorage.setItem(draftKey, '{"title":"임시저장한 제목"}')
    window.sessionStorage.setItem('sqa.view.reviews.member.filters', '"pending"')

    await act(async () => result.current.signOut())

    expect(window.localStorage.getItem(draftKey)).toBe('{"title":"임시저장한 제목"}')
    expect(window.sessionStorage.getItem('sqa.view.reviews.member.filters')).toBeNull()
    expect(authMocks.signOut).toHaveBeenCalledTimes(1)
    window.localStorage.removeItem(draftKey)
  })
})
