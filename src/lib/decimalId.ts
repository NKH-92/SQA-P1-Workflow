export type DecimalId = string | number

function normalizedDecimal(value: DecimalId): string {
  const raw = String(value)
  if (!/^\d+$/.test(raw)) return raw
  return raw.replace(/^0+(?=\d)/, '')
}

/** Exact comparison for non-negative bigint identifiers transported as decimal strings. */
export function compareDecimalIds(left: DecimalId, right: DecimalId): number {
  const leftValue = normalizedDecimal(left)
  const rightValue = normalizedDecimal(right)
  const leftNumeric = /^\d+$/.test(leftValue)
  const rightNumeric = /^\d+$/.test(rightValue)
  if (!leftNumeric || !rightNumeric) return leftValue.localeCompare(rightValue)
  if (leftValue.length !== rightValue.length) return leftValue.length - rightValue.length
  return leftValue === rightValue ? 0 : leftValue < rightValue ? -1 : 1
}

export function maxDecimalId(left: DecimalId | null, right: DecimalId): string {
  return left == null || compareDecimalIds(right, left) > 0 ? String(right) : String(left)
}
