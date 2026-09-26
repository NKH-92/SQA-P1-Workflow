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
  '이미 삭제됐거나 바꿀 수 없는 항목이에요. 목록을 새로고침한 뒤 다시 확인해 주세요.'

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

/** 권한 오류: 할 수 없는 이유와 다음 행동을 함께 알린다(UX 라이팅 UW-14). */
export const PERMISSION_MESSAGE = '이 작업을 할 권한이 없어요. 필요하면 파트장에게 요청해 주세요.'

/** 원인을 분류할 수 없을 때의 기본 안내 */
export const GENERIC_FAILURE_MESSAGE = '요청을 처리하지 못했어요. 다시 시도해도 안 되면 관리자에게 알려 주세요.'

const codeMessages: Record<string, string> = {
  '22P02': '입력한 값의 형식을 확인해 주세요.',
  '23505': '이미 등록된 항목이에요. 목록에서 확인해 주세요.',
  '23503': '연결된 데이터가 있어서 처리할 수 없어요. 연결을 먼저 정리해 주세요.',
  '23514': '입력한 값이 조건에 맞지 않아요. 내용을 확인해 주세요.',
  '42501': PERMISSION_MESSAGE,
  PGRST301: PERMISSION_MESSAGE,
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
    return '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'
  }

  if (isPostgrestError(error)) {
    const mapped = error.code ? codeMessages[error.code] : undefined
    if (mapped) {
      return mapped
    }

    const message = error.message ?? ''
    if (/permission denied|row-level security/i.test(message)) {
      return PERMISSION_MESSAGE
    }
    if (/duplicate key|unique constraint/i.test(message)) {
      return '이미 등록된 항목이에요. 목록에서 확인해 주세요.'
    }
    if (/foreign key|violates foreign key/i.test(message)) {
      return '연결된 데이터가 있어서 처리할 수 없어요. 연결을 먼저 정리해 주세요.'
    }
  }

  if (error instanceof Error) {
    const message = error.message
    if (/invalid login credentials/i.test(message)) {
      return '이메일 또는 비밀번호를 다시 확인해 주세요.'
    }
    if (/email not confirmed/i.test(message)) {
      return '이메일 인증이 필요해요. 받은 메일의 링크를 확인해 주세요.'
    }
    return GENERIC_FAILURE_MESSAGE
  }

  return GENERIC_FAILURE_MESSAGE
}
