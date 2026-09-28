import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { toErrorCode, toUserMessage } from './lib/errors'

// src/lib의 테스트는 계층 경계 검사에서 DB 호출 패턴을 쓸 수 없어서, PostgREST 시간 제한 검증은 여기 둔다.
describe('supabase PostgREST timeout', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.unstubAllEnvs()
  })

  async function loadSupabaseModule() {
    return import('./lib/supabase')
  }

  it('aborts a hung PostgREST request after the timeout so the mutate guard is released with the network message', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const requestedUrls: string[] = []
    // 응답도 실패도 돌려주지 않는 연결(half-open). abort 신호가 와야만 끝난다. 실제 네트워크에는 나가지 않는다.
    const hangingFetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      requestedUrls.push(String(input instanceof Request ? input.url : input))
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('signal is aborted without reason', 'AbortError'))
        })
      })
    })
    vi.stubGlobal('fetch', hangingFetch)
    vi.stubEnv('VITE_APP_MODE', 'production')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc123.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test')

    const { supabase, POSTGREST_TIMEOUT_MS } = await loadSupabaseModule()
    expect(POSTGREST_TIMEOUT_MS).toBe(60_000)

    let settled = false
    const pending = Promise.resolve(supabase!.rpc('get_core_bootstrap_v2')).finally(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(POSTGREST_TIMEOUT_MS - 1_000)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(1_000)
    const { error } = await pending

    expect(requestedUrls.some((url) => url.includes('/rest/v1/rpc/get_core_bootstrap_v2'))).toBe(true)
    expect(error).not.toBeInstanceOf(Error)
    expect(error?.message).toMatch(/^AbortError/)
    expect(toErrorCode(error)).toBe('aborted')
    expect(toUserMessage(error)).toBe('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
  })
})
