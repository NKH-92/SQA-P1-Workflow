import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import { useMutationRunner } from './useMutationRunner'

const refreshData = vi.fn(async () => undefined)

vi.mock('../../lib/supabase', () => ({
  supabase: null,
}))

describe('useMutationRunner', () => {
  beforeEach(() => {
    refreshData.mockClear()
  })

  it('returns true when the operation succeeds', async () => {
    const { result } = renderHook(() => useMutationRunner(refreshData))

    let ok = false
    await act(async () => {
      ok = await result.current.mutate(async () => undefined, '저장했습니다.')
    })

    expect(ok).toBe(true)
    expect(result.current.message).toEqual({ text: '저장했습니다.', tone: 'success' })
    expect(result.current.saving).toBe(false)
  })

  it('returns false when the operation throws', async () => {
    const { result } = renderHook(() => useMutationRunner(refreshData))

    let ok = true
    await act(async () => {
      ok = await result.current.mutate(async () => {
        throw new UserFacingError('저장에 실패했습니다.')
      }, '저장했습니다.')
    })

    expect(ok).toBe(false)
    expect(result.current.message).toEqual({ text: '저장에 실패했습니다.', tone: 'error' })
    expect(result.current.saving).toBe(false)
  })

  it('clears saving after completion', async () => {
    const { result } = renderHook(() => useMutationRunner(refreshData))

    await act(async () => {
      await result.current.mutate(async () => undefined, '완료')
    })

    await waitFor(() => {
      expect(result.current.saving).toBe(false)
    })
  })
})
