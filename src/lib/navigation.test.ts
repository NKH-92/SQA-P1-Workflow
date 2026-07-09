import { describe, expect, it } from 'vitest'
import { buildAppHash, buildShareUrl, parseAppHash, sanitizeTabForRole } from './navigation'

describe('parseAppHash', () => {
  it('parses tab and entity id from a deep link hash', () => {
    expect(parseAppHash('#/reviews?id=abc')).toEqual({ tab: 'reviews', entityId: 'abc' })
  })

  it('falls back to dashboard on unknown tab while keeping the entity id', () => {
    expect(parseAppHash('#/unknown?id=1')).toEqual({ tab: 'dashboard', entityId: '1' })
  })

  it('handles an empty hash', () => {
    expect(parseAppHash('')).toEqual({ tab: 'dashboard', entityId: null })
  })
})

describe('buildShareUrl', () => {
  it('joins origin, pathname, and the app hash with an encoded entity id', () => {
    expect(buildShareUrl('reviews', 'abc 1', { origin: 'https://app.example.com', pathname: '/' })).toBe(
      'https://app.example.com/#/reviews?id=abc%201',
    )
  })

  it('round-trips through parseAppHash', () => {
    const url = buildShareUrl('projects', 'p-1', { origin: 'https://x.dev', pathname: '/' })
    expect(parseAppHash(url.slice(url.indexOf('#')))).toEqual({ tab: 'projects', entityId: 'p-1' })
  })

  it('stays consistent with buildAppHash', () => {
    const location = { origin: 'https://x.dev', pathname: '/app/' }
    expect(buildShareUrl('team', 'u-1', location)).toBe(`https://x.dev/app/${buildAppHash('team', 'u-1')}`)
  })
})

describe('sanitizeTabForRole', () => {
  it('keeps members off leader tabs', () => {
    expect(sanitizeTabForRole('team', false)).toBe('dashboard')
  })

  it('keeps leaders off the member work tab', () => {
    expect(sanitizeTabForRole('work', true)).toBe('dashboard')
  })

  it('passes shared tabs through unchanged', () => {
    expect(sanitizeTabForRole('reviews', false)).toBe('reviews')
    expect(sanitizeTabForRole('reviews', true)).toBe('reviews')
  })
})
