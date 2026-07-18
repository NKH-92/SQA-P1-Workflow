import type { AuditEvent } from '../../types'

const SENSITIVE_AUDIT_FIELD = /(^|_)(password|encrypted_password|token|secret|service_key|session|credential)(_|$)/i

export function isSensitiveAuditField(field: string) {
  return field !== 'must_change_password' && SENSITIVE_AUDIT_FIELD.test(field)
}

export function safeAuditFields(event: Pick<AuditEvent, 'changed_fields'>) {
  return event.changed_fields.filter((field) => !isSensitiveAuditField(field))
}

export function safeAuditDelta(delta: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(delta).filter(([field]) => !isSensitiveAuditField(field)))
}

export function auditValueText(value: unknown) {
  if (value === null) return 'null'
  if (value === undefined) return '—'
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export function isLegacyAuditLifecycle(event: AuditEvent) {
  const fields = safeAuditFields(event)
  return event.action !== 'updated' && fields.length === 1 && fields[0] === 'id'
}
