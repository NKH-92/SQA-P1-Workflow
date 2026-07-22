import { afterEach, describe, expect, it, vi } from 'vitest'

const createClient = vi.hoisted(() => vi.fn(() => ({ auth: {} })))

vi.mock('@supabase/supabase-js', () => ({ createClient }))

async function loadConfig(mode: string, url: string) {
  vi.resetModules()
  vi.stubEnv('VITE_APP_MODE', mode)
  vi.stubEnv('VITE_SUPABASE_URL', url)
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'local-anon-key')
  return import('./supabase')
}

describe('Supabase browser configuration boundary', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    createClient.mockClear()
  })

  it('allows loopback HTTP only for the explicit remote E2E mode', async () => {
    expect((await loadConfig('remote', 'http://127.0.0.1:54321')).hasSupabaseConfig).toBe(true)
    expect((await loadConfig('production', 'http://127.0.0.1:54321')).hasSupabaseConfig).toBe(false)
    expect((await loadConfig('remote', 'http://example.test:54321')).hasSupabaseConfig).toBe(false)
  })

  it('keeps HTTPS Supabase URLs available in production', async () => {
    expect((await loadConfig('production', 'https://project.supabase.co')).hasSupabaseConfig).toBe(true)
  })
})
