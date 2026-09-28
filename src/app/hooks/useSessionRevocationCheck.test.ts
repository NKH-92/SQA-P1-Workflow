import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSessionRevocationCheck } from './useSessionRevocationCheck'

type Props = { code: string | null | undefined; profileId: string | null }

function setup(initial: Props) {
  const retryProfileLoad = vi.fn()
  const hook = renderHook(
    ({ code, profileId }: Props) => useSessionRevocationCheck(code, retryProfileLoad, profileId),
    { initialProps: initial },
  )
  return { ...hook, retryProfileLoad }
}

describe('useSessionRevocationCheck', () => {
  it('re-checks the profile once when the server says the session can no longer use the app', () => {
    const { rerender, retryProfileLoad } = setup({ code: null, profileId: 'user-1' })
    expect(retryProfileLoad).not.toHaveBeenCalled()

    rerender({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-1' })
    expect(retryProfileLoad).toHaveBeenCalledTimes(1)

    // 같은 오류가 이어져도(연속 실패) 같은 프로필에서는 다시 부르지 않는다.
    rerender({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-1' })
    expect(retryProfileLoad).toHaveBeenCalledTimes(1)
  })

  it('ignores other sync errors and signed-out state', () => {
    const { rerender, retryProfileLoad } = setup({ code: 'network', profileId: 'user-1' })
    rerender({ code: 'P0001', profileId: 'user-1' })
    rerender({ code: undefined, profileId: 'user-1' })
    rerender({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: null })
    expect(retryProfileLoad).not.toHaveBeenCalled()
  })

  it('allows another re-check after a successful sync clears the error', () => {
    const { rerender, retryProfileLoad } = setup({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-1' })
    expect(retryProfileLoad).toHaveBeenCalledTimes(1)

    rerender({ code: null, profileId: 'user-1' })
    rerender({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-1' })
    expect(retryProfileLoad).toHaveBeenCalledTimes(2)
  })

  it('does not re-check the same profile again when it briefly disappears during the re-check', () => {
    const { rerender, retryProfileLoad } = setup({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-1' })
    expect(retryProfileLoad).toHaveBeenCalledTimes(1)

    // 재확인이 실패해 프로필이 잠시 비었다가 [다시 시도]로 같은 프로필이 돌아와도 코드가 그대로면 다시 부르지 않는다.
    rerender({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: null })
    rerender({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-1' })
    expect(retryProfileLoad).toHaveBeenCalledTimes(1)
  })

  it('re-checks again for a different profile', () => {
    const { rerender, retryProfileLoad } = setup({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-1' })
    rerender({ code: 'SQA_APP_ACCESS_REQUIRED', profileId: 'user-2' })
    expect(retryProfileLoad).toHaveBeenCalledTimes(2)
  })
})
