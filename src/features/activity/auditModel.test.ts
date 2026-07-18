import { describe, expect, it } from 'vitest'
import { auditValueText, isSensitiveAuditField, safeAuditDelta } from './auditModel'

describe('audit display safety', () => {
  it('blocks credentials while retaining the explicit password-state business field', () => {
    for (const field of ['password', 'encrypted_password', 'access_token', 'service_key', 'session_id', 'api_secret', 'credential']) {
      expect(isSensitiveAuditField(field), field).toBe(true)
    }
    expect(isSensitiveAuditField('must_change_password')).toBe(false)
  })

  it('removes sensitive top-level fields as defense in depth', () => {
    expect(safeAuditDelta({ title: '업무', access_token: 'hidden', must_change_password: true }))
      .toEqual({ title: '업무', must_change_password: true })
  })

  it('renders nested unknown values deterministically', () => {
    expect(auditValueText({ nested: ['a', 1] })).toBe('{\n  "nested": [\n    "a",\n    1\n  ]\n}')
  })
})
