import { describe, expect, it } from 'vitest'
import { isSupabaseRlsTargetConfigured } from '../tests/rls/helpers'

const targetRef = 'abcdefghijklmnopqrst'
const productionRef = 'zyxwvutsrqponmlkjihg'

describe('RLS target guard', () => {
  it('allows localhost without enabling remote execution', () => {
    expect(isSupabaseRlsTargetConfigured({ SUPABASE_URL: 'http://127.0.0.1:54321' })).toBe(true)
  })

  it('allows only an explicitly confirmed, allowlisted, non-production Supabase target', () => {
    const environment = {
      SUPABASE_URL: `https://${targetRef}.supabase.co`,
      RLS_ALLOW_REMOTE_DISPOSABLE: '1',
      RLS_CONFIRM_DISPOSABLE_TARGET: 'true',
      RLS_REMOTE_TARGET_REF: targetRef,
      RLS_PRODUCTION_PROJECT_REF: productionRef,
      RLS_ALLOWED_TARGET_REFS: `other-ref,${targetRef}`,
    }
    expect(isSupabaseRlsTargetConfigured(environment)).toBe(true)

    for (const mutate of [
      (env: typeof environment) => { env.RLS_ALLOW_REMOTE_DISPOSABLE = '0' },
      (env: typeof environment) => { env.RLS_CONFIRM_DISPOSABLE_TARGET = 'false' },
      (env: typeof environment) => { env.RLS_PRODUCTION_PROJECT_REF = targetRef },
      (env: typeof environment) => { env.RLS_ALLOWED_TARGET_REFS = 'other-ref' },
      (env: typeof environment) => { env.SUPABASE_URL = 'https://attacker.example.com' },
    ]) {
      const changed = { ...environment }
      mutate(changed)
      expect(isSupabaseRlsTargetConfigured(changed)).toBe(false)
    }
  })
})
