import { describe, expect, it } from 'vitest'
import config from '../supabase/config.toml?raw'

describe('local Supabase RLS test configuration', () => {
  it('mirrors production signup and password safety defaults', () => {
    // Global signups stay off, but the email provider must stay ON to mirror production
    // (deploy-worker.yml asserts external.email == true in /auth/v1/settings).
    expect(config).toMatch(/\[auth\][\s\S]*?enable_signup = false/)
    expect(config).toMatch(/\[auth\.email\][\s\S]*?enable_signup = true/)
    expect(config).toContain('enable_anonymous_sign_ins = false')
    expect(config).toContain('minimum_password_length = 8')
    expect(config).toContain('enable_confirmations = true')
    expect(config).toContain('secure_password_change = false')
  })

  it('applies migrations and the committed seed entrypoint on reset', () => {
    expect(config).toContain('[db.migrations]')
    expect(config).toContain('enabled = true')
    expect(config).toContain('sql_paths = ["./seed.sql"]')
  })
})
