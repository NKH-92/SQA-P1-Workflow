/**
 * Shared helpers for the one-transaction-snapshot bootstrap RPCs
 * (get_core_bootstrap_v2, get_change_bootstrap_v2). Every consumer treats a
 * schema_version mismatch the same way the review v2 bootstrap treats an RPC
 * error: fail-closed, never silently coerced into an empty/partial result.
 */
export class BootstrapSchemaVersionError extends Error {
  readonly detail: string

  constructor(
    readonly rpcName: string,
    readonly expected: number,
    readonly received: unknown,
  ) {
    super(`${rpcName} schema_version mismatch: expected ${expected}, received ${JSON.stringify(received)}`)
    this.name = 'BootstrapSchemaVersionError'
    this.detail = 'SQA_BOOTSTRAP_SCHEMA_MISMATCH'
  }
}

export class BootstrapEnvelopeMissingError extends Error {
  readonly detail = 'SQA_BOOTSTRAP_ENVELOPE_MISSING'

  constructor(readonly rpcName: string) {
    super(`${rpcName} returned a null envelope`)
    this.name = 'BootstrapEnvelopeMissingError'
  }
}

export class BootstrapEnvelopeInvalidError extends Error {
  readonly detail = 'SQA_BOOTSTRAP_ENVELOPE_INVALID'

  constructor(readonly rpcName: string, readonly field: string) {
    super(`${rpcName} returned an invalid required field: ${field}`)
    this.name = 'BootstrapEnvelopeInvalidError'
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isValidIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value))
}

export function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function requireArrayFields(
  rpcName: string,
  value: unknown,
  fields: readonly string[],
): BootstrapEnvelopeInvalidError | null {
  if (!isRecord(value)) return new BootstrapEnvelopeInvalidError(rpcName, 'data')
  for (const field of fields) {
    if (!Array.isArray(value[field])) return new BootstrapEnvelopeInvalidError(rpcName, `data.${field}`)
  }
  return null
}

/** Required bootstrap RPCs must return a non-null, versioned envelope. */
export function checkBootstrapSchemaVersion(
  rpcName: string,
  expected: number,
  envelope: unknown,
): BootstrapSchemaVersionError | BootstrapEnvelopeMissingError | BootstrapEnvelopeInvalidError | null {
  if (envelope == null) return new BootstrapEnvelopeMissingError(rpcName)
  if (!isRecord(envelope)) return new BootstrapEnvelopeInvalidError(rpcName, 'envelope')
  if (envelope.schema_version !== expected) {
    return new BootstrapSchemaVersionError(rpcName, expected, envelope.schema_version)
  }
  return null
}
