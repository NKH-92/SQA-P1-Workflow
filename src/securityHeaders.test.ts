import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { renderSecurityHeaders } from '../scripts/render-security-headers.mjs'

describe('security header template', () => {
  it('requires HSTS for the Worker origin and keeps the CSP template explicit', () => {
    const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')

    expect(headers).toContain('Strict-Transport-Security: max-age=31536000')
    expect(headers).toContain('connect-src')
    expect(headers).toContain('https://*.supabase.co')
    expect(headers).toContain('/change-application-products-template.xlsx')
    expect(headers).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  })

  it('lets read-excel-file start its blob: worker without widening script-src', () => {
    const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')
    const csp = headers.match(/Content-Security-Policy: (.+)/)?.[1] ?? ''

    expect(csp).toContain("worker-src 'self' blob:")
    expect(csp).toContain("script-src 'self';")
    expect(csp).toContain("default-src 'self';")
    expect(renderSecurityHeaders(headers, 'https://abcdefghijklmnop.supabase.co')).toContain("worker-src 'self' blob:")
  })

  it('caches hashed assets as immutable while index and version.json keep revalidating', () => {
    const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf8')

    expect(headers).toMatch(/^\/assets\/\*\r?\n {2}Cache-Control: public, max-age=31536000, immutable\r?$/m)
    expect(headers).toMatch(/\/version\.json\s+Cache-Control: no-store/)
    // index.html은 규칙을 주지 않아 기존대로 재검증된다. /* 전체 규칙에도 캐시 헤더를 두지 않는다.
    expect(headers).not.toMatch(/^\/index\.html/m)
    expect(headers).not.toMatch(/^\/\*\r?\n(?: {2}.+\r?\n)* {2}Cache-Control/m)
  })
})
