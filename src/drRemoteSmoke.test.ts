import { describe, expect, it } from 'vitest'
// @ts-expect-error The operational .mjs entrypoint is exercised directly at runtime.
import { assertRemoteTargetSafety } from '../scripts/run-dr-remote-smoke.mjs'

const targetProjectRef = 'abcdefghijklmnopqrst'
const productionProjectRef = 'zyxwvutsrqponmlkjihg'

describe('remote DR smoke safety', () => {
  it('accepts only the exact confirmed Supabase target URL and allowlist entry', () => {
    expect(() => assertRemoteTargetSafety({
      targetProjectRef,
      productionProjectRef,
      allowedTargetRefs: `other,${targetProjectRef}`,
      targetUrl: `https://${targetProjectRef}.supabase.co/`,
      confirmDisposableTarget: 'true',
    })).not.toThrow()
  })

  it.each([
    ['not confirmed', { confirmDisposableTarget: 'false' }],
    ['production', { productionProjectRef: targetProjectRef }],
    ['not allowlisted', { allowedTargetRefs: 'other' }],
    ['wrong host', { targetUrl: 'https://attacker.example.com/' }],
    ['host suffix attack', { targetUrl: `https://${targetProjectRef}.supabase.co.attacker.example/` }],
  ])('rejects %s', (_label, override) => {
    expect(() => assertRemoteTargetSafety({
      targetProjectRef,
      productionProjectRef,
      allowedTargetRefs: targetProjectRef,
      targetUrl: `https://${targetProjectRef}.supabase.co/`,
      confirmDisposableTarget: 'true',
      ...override,
    })).toThrow(/SQA_DR_/)
  })
})
