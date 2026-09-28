import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import { resetErrorReporter } from '../../lib/errorReporter'
import { useMutationRunner } from './useMutationRunner'

// 원격(Supabase) 모드: 저장 뒤에는 서버 목록을 다시 불러온다.
vi.mock('../../lib/supabase', () => ({
  supabase: {},
}))

describe('useMutationRunner (remote)', () => {
  afterEach(() => {
    resetErrorReporter()
  })

  it('reloads the list after a failed operation so work the server already saved shows up', async () => {
    const refreshData = vi.fn(async () => undefined)
    const { result } = renderHook(() => useMutationRunner(refreshData))

    let ok = true
    await act(async () => {
      ok = await result.current.mutate(async () => {
        throw new UserFacingError('남은 2건을 다시 처리해 주세요.')
      }, '완료했어요.')
    })

    expect(ok).toBe(false)
    expect(refreshData).toHaveBeenCalledTimes(1)
    expect(result.current.message).toMatchObject({ text: '남은 2건을 다시 처리해 주세요.', tone: 'error' })
  })

  it('keeps the failure message when that reload fails too', async () => {
    const refreshData = vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    })
    const { result } = renderHook(() => useMutationRunner(refreshData))

    let ok = true
    await act(async () => {
      ok = await result.current.mutate(async () => {
        throw new UserFacingError('저장하지 못했어요.')
      }, '저장했어요.')
    })

    expect(ok).toBe(false)
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.message).toMatchObject({ text: '저장하지 못했어요.', tone: 'error' })
  })

  it('skips the full reload after success when the repository already re-read what changed, but still reloads after a failure', async () => {
    const refreshData = vi.fn(async () => undefined)
    const { result } = renderHook(() => useMutationRunner(refreshData))

    let ok = false
    await act(async () => {
      ok = await result.current.mutate(async () => undefined, '상태를 바꿨어요.', { refresh: false })
    })
    expect(ok).toBe(true)
    expect(refreshData).not.toHaveBeenCalled()
    expect(result.current.message).toMatchObject({ text: '상태를 바꿨어요.', tone: 'success' })

    await act(async () => {
      ok = await result.current.mutate(async () => {
        throw new UserFacingError('바꾸지 못했어요.')
      }, '상태를 바꿨어요.', { refresh: false })
    })
    expect(ok).toBe(false)
    expect(refreshData).toHaveBeenCalledTimes(1)

    await act(async () => {
      await result.current.mutate(async () => undefined, '저장했어요.')
    })
    expect(refreshData).toHaveBeenCalledTimes(2)
  })
})
