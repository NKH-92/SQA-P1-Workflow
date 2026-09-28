import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { AuthApiError, AuthRetryableFetchError, AuthSessionMissingError } from '@supabase/supabase-js'
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
  getUser: vi.fn<() => Promise<{ data: { user: typeof user | null }; error: Error | null }>>(async () => ({
    data: { user },
    error: null,
  })),
  signOut: vi.fn(async (_options?: { scope?: string }) => ({ error: null })),
  unsubscribe: vi.fn(),
  authStateListener: null as null | ((event: string, session: { user: { id: string } } | null) => void),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  isPreviewMode: false,
  supabase: {
    auth: {
      getSession: authMocks.getSession,
      getUser: authMocks.getUser,
      signOut: authMocks.signOut,
      onAuthStateChange: vi.fn((listener: NonNullable<typeof authMocks.authStateListener>) => {
        authMocks.authStateListener = listener
        return { data: { subscription: { unsubscribe: authMocks.unsubscribe } } }
      }),
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
    authMocks.getUser.mockReset()
    authMocks.getUser.mockImplementation(async () => ({ data: { user }, error: null }))
    authMocks.signOut.mockClear()
    authMocks.authStateListener = null
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
    // 이 기기만 로그아웃한다. 같은 사람의 다른 기기 세션은 그대로 둔다.
    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    window.localStorage.removeItem(draftKey)
  })

  it('clears every notice, including persistent temporary-password toasts, on sign-out', async () => {
    const refreshData = vi.fn<(options?: { initial?: boolean }) => Promise<void>>().mockResolvedValue(undefined)
    const setData = vi.fn() as unknown as React.Dispatch<React.SetStateAction<AppData>>
    const clearAllToasts = vi.fn()

    const { result } = renderHook(() =>
      useAuthProfile(refreshData, setData, vi.fn(), vi.fn(), vi.fn(), clearAllToasts),
    )
    await waitFor(() => expect(result.current.profile).toEqual(profile))
    expect(clearAllToasts).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.signOut()
    })

    expect(authMocks.signOut).toHaveBeenCalled()
    expect(clearAllToasts).toHaveBeenCalled()
  })

  // 효과 의존성이 매 렌더 바뀌지 않도록(App에서처럼) 고정된 콜백을 넘긴다.
  const stableRefreshData = vi.fn(async () => undefined)
  const stableSetData = vi.fn() as unknown as React.Dispatch<React.SetStateAction<AppData>>
  const stableSetMessage = vi.fn()
  const stableNoop = vi.fn()

  it('keeps the session and offers a retry when getUser fails transiently', async () => {
    authMocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthRetryableFetchError('Failed to fetch', 0),
    })
    const refreshData = vi.fn<(options?: { initial?: boolean }) => Promise<void>>().mockResolvedValue(undefined)
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() =>
      useAuthProfile(refreshData, stableSetData, stableSetMessage, stableNoop, stableNoop),
    )

    await waitFor(() => expect(result.current.profileLoadError).toBeTruthy())
    expect(result.current.sessionUser).toEqual(user)
    expect(authMocks.signOut).not.toHaveBeenCalled()

    authMocks.getUser.mockResolvedValue({ data: { user }, error: null })
    act(() => result.current.retryProfileLoad())
    await waitFor(() => expect(result.current.profile).toEqual(profile))
  })

  it('also treats a 5xx from getUser as a temporary failure', async () => {
    authMocks.getUser.mockResolvedValue({
      data: { user: null },
      error: new AuthApiError('Service Unavailable', 503, undefined),
    })
    vi.spyOn(console, 'error').mockImplementation(() => {})

    const { result } = renderHook(() =>
      useAuthProfile(stableRefreshData, stableSetData, stableSetMessage, stableNoop, stableNoop),
    )

    await waitFor(() => expect(result.current.profileLoadError).toBeTruthy())
    expect(authMocks.signOut).not.toHaveBeenCalled()
  })

  it.each([
    ['a missing session', () => new AuthSessionMissingError()],
    ['a revoked session (403)', () => new AuthApiError('Session not found', 403, 'session_not_found')],
    ['an expired token (401)', () => new AuthApiError('invalid JWT', 401, 'bad_jwt')],
  ])('signs out only this device on %s', async (_label, makeError) => {
    authMocks.getUser.mockResolvedValue({ data: { user: null }, error: makeError() })

    const { result } = renderHook(() =>
      useAuthProfile(stableRefreshData, stableSetData, stableSetMessage, stableNoop, stableNoop),
    )

    await waitFor(() => expect(result.current.sessionUser).toBeNull())
    expect(authMocks.signOut).toHaveBeenCalledWith({ scope: 'local' })
    expect(result.current.profileLoadError).toBeNull()
    expect(result.current.profile).toBeNull()
  })

  it('keeps the same session user object when an auth event repeats the same person', async () => {
    const { result } = renderHook(() =>
      useAuthProfile(stableRefreshData, stableSetData, stableSetMessage, stableNoop, stableNoop),
    )
    await waitFor(() => expect(result.current.profile).toEqual(profile))
    const before = result.current.sessionUser

    act(() => authMocks.authStateListener?.('SIGNED_IN', { user: { id: user.id } }))
    expect(result.current.sessionUser).toBe(before)

    act(() => authMocks.authStateListener?.('SIGNED_OUT', null))
    expect(result.current.sessionUser).toBeNull()
  })
})
