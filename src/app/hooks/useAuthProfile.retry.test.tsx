import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
          maybeSingle: vi.fn(async () => ({ data: profile, error: null })),
        })),
      })),
    })),
  },
}))

import { useAuthProfile } from './useAuthProfile'

describe('useAuthProfile retry', () => {
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
})
