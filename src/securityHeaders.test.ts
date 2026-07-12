import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('security header template', () => {
  it('requires HSTS for the Worker origin and keeps the CSP template explicit', () => {
    const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')

    expect(headers).toContain('Strict-Transport-Security: max-age=31536000')
    expect(headers).toContain('connect-src')
    expect(headers).toContain('https://*.supabase.co')
  })
})
