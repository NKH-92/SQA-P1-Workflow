type PostgrestErrorLike = {
  code?: string
  message?: string
}

type SafeDetailErrorLike = {
  detail?: unknown
}

export class UserFacingError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UserFacingError'
  }
}

export const STALE_WRITE_MESSAGE =
  '이미 삭제되었거나 변경할 수 없는 항목입니다. 목록을 새로고침해 주세요.'

export function assertRecordExists<T>(record: T | null | undefined): asserts record is T {
  if (record == null) throw new UserFacingError(STALE_WRITE_MESSAGE)
}

export function assertAffectedRows(rows: unknown[] | null | undefined): void {
  if (!rows || rows.length === 0) throw new UserFacingError(STALE_WRITE_MESSAGE)
}

function isPostgrestError(error: unknown): error is PostgrestErrorLike {
  return typeof error === 'object' && error !== null && ('code' in error || 'message' in error)
}

function isNetworkError(error: unknown) {
  if (!(error instanceof Error)) return false
  const message = error.message.toLowerCase()
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('networkerror') ||
    error.name === 'TypeError'
  )
}

const codeMessages: Record<string, string> = {
  '22P02': '입력 형식이 올바르지 않습니다.',
  '23505': '이미 등록된 항목입니다.',
  '23503': '연결된 데이터가 있어 처리할 수 없습니다.',
  '23514': '입력값이 조건을 만족하지 않습니다.',
  '42501': '권한이 없습니다.',
  PGRST301: '권한이 없습니다.',
}

const safeDetailCodes = new Set([
  'SQA_BOOTSTRAP_SCHEMA_MISMATCH',
])

function safeDetailCode(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const detail = (error as SafeDetailErrorLike).detail
  return typeof detail === 'string' && safeDetailCodes.has(detail) ? detail : null
}

/**
 * 관측성용 안전 오류 코드. 사용자 입력이나 서버 오류 message 원문(업무 body, 이메일 등
 * PII를 포함할 수 있음)은 절대 반환하지 않고, 분류된 코드만 반환한다.
 */
export function toErrorCode(error: unknown): string {
  if (error instanceof UserFacingError) return 'stale-write'
  if (isNetworkError(error)) return 'network'
  const detailCode = safeDetailCode(error)
  if (detailCode) return detailCode
  if (isPostgrestError(error) && error.code) return error.code
  if (error instanceof Error && error.name === 'AbortError') return 'aborted'
  return 'unknown'
}

export function toUserMessage(error: unknown): string {
  if (error instanceof UserFacingError) {
    return error.message
  }

  if (isNetworkError(error)) {
    return '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'
  }

  if (isPostgrestError(error)) {
    const mapped = error.code ? codeMessages[error.code] : undefined
    if (mapped) {
      return mapped
    }

    const message = error.message ?? ''
    if (/permission denied|row-level security/i.test(message)) {
      return '권한이 없습니다.'
    }
    if (/duplicate key|unique constraint/i.test(message)) {
      return '이미 등록된 항목입니다.'
    }
    if (/foreign key|violates foreign key/i.test(message)) {
      return '연결된 데이터가 있어 처리할 수 없습니다.'
    }
  }

  if (error instanceof Error) {
    const message = error.message
    if (/invalid login credentials/i.test(message)) {
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    }
    if (/email not confirmed/i.test(message)) {
      return '이메일 인증이 필요합니다. 받은 메일의 링크를 확인해 주세요.'
    }
    return '작업을 완료하지 못했습니다. 문제가 반복되면 관리자에게 문의하세요.'
  }

  return '작업을 완료하지 못했습니다. 문제가 반복되면 관리자에게 문의하세요.'
}
