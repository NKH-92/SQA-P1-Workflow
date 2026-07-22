import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError } from '../../lib/errors'
import { assertAllowedErrorReport, resetErrorReporter, setErrorReporter } from '../../lib/errorReporter'
import { useMutationRunner } from './useMutationRunner'
import type { MutationErrorReportContext } from './useMutationRunner'

const refreshData = vi.fn(async () => undefined)

vi.mock('../../lib/supabase', () => ({
  supabase: null,
}))

describe('useMutationRunner', () => {
  beforeEach(() => {
    refreshData.mockClear()
  })

  afterEach(() => {
    resetErrorReporter()
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

  it('reports a failed operation via the error reporter using the given role/route, without a role/route arg it defaults to unknown', async () => {
    const reporter = { report: vi.fn() }
    setErrorReporter(reporter)
    const { result } = renderHook(() => useMutationRunner(refreshData))

    await act(async () => {
      await result.current.mutate(async () => {
        throw new UserFacingError('저장에 실패했습니다.')
      }, '검토요청을 등록했습니다.')
    })

    expect(reporter.report).toHaveBeenCalledTimes(1)
    const report = reporter.report.mock.calls[0][0]
    expect(() => assertAllowedErrorReport(report)).not.toThrow()
    expect(report).toMatchObject({ role: 'unknown', route: 'unknown', operation: 'mutation' })
  })

  it('reports using the latest role/route context without recreating the mutate callback', async () => {
    const reporter = { report: vi.fn() }
    setErrorReporter(reporter)
    const initialProps: MutationErrorReportContext = { role: 'member', route: 'reviews' }
    const { result, rerender } = renderHook(
      ({ role, route }) => useMutationRunner(refreshData, () => ({ role, route })),
      { initialProps },
    )
    const firstMutate = result.current.mutate

    rerender({ role: 'leader', route: 'change-applications' })
    expect(result.current.mutate).toBe(firstMutate)

    await act(async () => {
      await result.current.mutate(async () => {
        throw new UserFacingError('실패')
      }, '작업')
    })

    expect(reporter.report.mock.calls[0][0]).toMatchObject({ role: 'leader', route: 'change-applications' })
  })

  it('does not report anything when the operation succeeds', async () => {
    const reporter = { report: vi.fn() }
    setErrorReporter(reporter)
    const { result } = renderHook(() => useMutationRunner(refreshData))

    await act(async () => {
      await result.current.mutate(async () => undefined, '저장했습니다.')
    })

    expect(reporter.report).not.toHaveBeenCalled()
  })
})
