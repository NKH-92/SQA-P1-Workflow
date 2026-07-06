import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('supabase mode detection', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  async function loadSupabaseModule() {
    return import('./supabase')
  }

  it('treats placeholder env as missing Supabase config', async () => {
    vi.stubEnv('VITE_APP_MODE', 'development')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://your-project-ref.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'your-public-anon-key')

    const { hasSupabaseConfig, isPreviewMode } = await loadSupabaseModule()

    expect(hasSupabaseConfig).toBe(false)
    expect(isPreviewMode).toBe(false)
  })

  it('enables preview mode only when explicitly requested without Supabase config', async () => {
    vi.stubEnv('VITE_APP_MODE', 'preview')
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { hasSupabaseConfig, isPreviewMode } = await loadSupabaseModule()

    expect(hasSupabaseConfig).toBe(false)
    expect(isPreviewMode).toBe(true)
  })

  it('does not enable preview mode in production without Supabase config', async () => {
    vi.stubEnv('VITE_APP_MODE', 'production')
    vi.stubEnv('VITE_SUPABASE_URL', '')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', '')

    const { hasSupabaseConfig, isPreviewMode, isProductionMode } = await loadSupabaseModule()

    expect(hasSupabaseConfig).toBe(false)
    expect(isPreviewMode).toBe(false)
    expect(isProductionMode).toBe(true)
  })

  it('detects real Supabase config and disables preview mode', async () => {
    vi.stubEnv('VITE_APP_MODE', 'production')
    vi.stubEnv('VITE_SUPABASE_URL', 'https://abc123.supabase.co')
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test')

    const { hasSupabaseConfig, isPreviewMode, supabase } = await loadSupabaseModule()

    expect(hasSupabaseConfig).toBe(true)
    expect(isPreviewMode).toBe(false)
    expect(supabase).not.toBeNull()
  })
})
