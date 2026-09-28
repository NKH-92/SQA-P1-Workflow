type PostgrestErrorLike = {
  code?: string
  message?: string
}

type SafeDetailErrorLike = {
  details?: unknown
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

/**
 * supabase-js(postgrest)는 fetch 실패를 Error가 아닌 일반 객체로 돌려준다.
 * 예: { message: 'TypeError: Failed to fetch', details: '', hint: '', code: '' }
 * Chrome은 'Failed to fetch', Firefox는 'NetworkError …', iOS Safari는 'Load failed'를 쓴다.
 */
const PLAIN_NETWORK_FAILURE = /failed to fetch|networkerror|load failed/i
const ABORT_ERROR_MESSAGE = /^AbortError\b/

export function isNetworkError(error: unknown) {
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return (
      message.includes('failed to fetch') ||
      message.includes('network') ||
      message.includes('networkerror') ||
      error.name === 'TypeError'
    )
  }
  if (typeof error !== 'object' || error === null) return false
  const { message, code } = error as { message?: unknown; code?: unknown }
  if (typeof message !== 'string') return false
  // 서버가 돌려준 오류(code 있음)나 요청 취소·시간 초과(AbortError)는 연결 실패로 보지 않는다.
  if (code !== undefined && code !== null && code !== '') return false
  if (ABORT_ERROR_MESSAGE.test(message)) return false
  return PLAIN_NETWORK_FAILURE.test(message)
}

/**
 * 요청 취소·시간 초과. Error(DOMException) 그대로이거나, postgrest가 감싼 일반 객체
 * ({ message: 'AbortError: signal is aborted without reason', code: '' })로 온다.
 */
export function isAbortError(error: unknown) {
  if (typeof error !== 'object' || error === null) return false
  const { name, message } = error as { name?: unknown; message?: unknown }
  if (name === 'AbortError') return true
  if (error instanceof Error) return false
  return typeof message === 'string' && ABORT_ERROR_MESSAGE.test(message)
}

/** 새 배포 뒤 예전 해시의 JS·CSS 조각을 받지 못한 경우. 화면 전체를 새로 불러와야 풀린다. */
const CHUNK_LOAD_ERROR =
  /dynamically imported module|error loading dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError|Unable to preload CSS/i

export function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_LOAD_ERROR.test(error.message)
}

/** 권한 오류: 할 수 없는 이유와 다음 행동을 함께 알린다(UX 라이팅 UW-14). */
export const PERMISSION_MESSAGE = '이 작업을 할 권한이 없어요. 필요하면 파트장에게 요청해 주세요.'

/** 원인을 분류할 수 없을 때의 기본 안내 */
export const GENERIC_FAILURE_MESSAGE = '요청을 처리하지 못했어요. 다시 시도해도 안 되면 관리자에게 알려 주세요.'

export const NETWORK_FAILURE_MESSAGE = '서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.'

/** 서버 계약(RPC·bootstrap 형식)이 바뀌어 열어 둔 탭의 옛 번들로는 처리할 수 없을 때 */
export const APP_UPDATED_MESSAGE = '앱이 새 버전으로 바뀌었어요. 브라우저에서 새로고침(F5)해 주세요.'

/** 새 배포로 화면 조각(JS·CSS) 파일이 바뀌어 불러오지 못했을 때 */
export const CHUNK_LOAD_MESSAGE = '새 버전이 배포돼 필요한 파일이 바뀌었어요. 화면을 새로고침(F5)해 주세요.'

const BUSY_RETRY_MESSAGE = '다른 사람이 같은 항목을 처리하고 있어 요청이 취소됐어요. 잠시 후 다시 시도해 주세요.'

const codeMessages: Record<string, string> = {
  '22P02': '입력한 값의 형식을 확인해 주세요.',
  '23505': '이미 등록된 항목이에요. 목록에서 확인해 주세요.',
  '23503': '연결된 데이터가 있어서 처리할 수 없어요. 연결을 먼저 정리해 주세요.',
  '23514': '입력한 값이 조건에 맞지 않아요. 내용을 확인해 주세요.',
  '42501': PERMISSION_MESSAGE,
  PGRST301: PERMISSION_MESSAGE,
  // statement_timeout·lock_timeout·교착: 서버가 요청을 통째로 되돌렸으니 다시 시도하면 된다.
  '57014': '처리 시간이 길어져 요청이 취소됐어요. 잠시 후 다시 시도해 주세요.',
  '55P03': BUSY_RETRY_MESSAGE,
  '40P01': BUSY_RETRY_MESSAGE,
  // RPC를 찾지 못함: 열어 둔 탭이 배포 전 번들로 옛 함수를 부른 경우다.
  PGRST202: APP_UPDATED_MESSAGE,
}

const safeDetailCodes = new Set([
  'SQA_BOOTSTRAP_SCHEMA_MISMATCH',
  'SQA_APP_ACCESS_REQUIRED',
])

/**
 * 서버 오류의 detail 문자열. PostgREST는 `details`, 앱이 만든 오류(BootstrapSchemaVersionError 등)는
 * `detail`에 담는다. 표시하지 않고 코드 비교에만 쓴다.
 */
export function errorDetailText(error: unknown): string {
  if (typeof error !== 'object' || error === null) return ''
  const { details, detail } = error as SafeDetailErrorLike
  if (typeof details === 'string' && details) return details
  return typeof detail === 'string' ? detail : ''
}

function safeDetailCode(error: unknown): string | null {
  const detail = errorDetailText(error)
  return safeDetailCodes.has(detail) ? detail : null
}

/**
 * 관측성용 안전 오류 코드. 사용자 입력이나 서버 오류 message 원문(업무 body, 이메일 등
 * PII를 포함할 수 있음)은 절대 반환하지 않고, 분류된 코드만 반환한다.
 */
export function toErrorCode(error: unknown): string {
  if (error instanceof UserFacingError) return 'stale-write'
  if (isChunkLoadError(error)) return 'chunk-load'
  if (isNetworkError(error)) return 'network'
  const detailCode = safeDetailCode(error)
  if (detailCode) return detailCode
  // DOMException(AbortError)은 숫자 code(20)를 가지므로 PostgREST code보다 먼저 본다.
  if (isAbortError(error)) return 'aborted'
  if (isPostgrestError(error) && error.code) return error.code
  return 'unknown'
}

export function toUserMessage(error: unknown): string {
  if (error instanceof UserFacingError) {
    return error.message
  }

  // 'Failed to fetch dynamically imported module'도 TypeError라 네트워크 판정보다 먼저 본다.
  if (isChunkLoadError(error)) {
    return CHUNK_LOAD_MESSAGE
  }

  if (safeDetailCode(error) === 'SQA_BOOTSTRAP_SCHEMA_MISMATCH') {
    return APP_UPDATED_MESSAGE
  }

  // 요청 시간 초과(supabase db.timeout)도 응답 없는 연결이므로 같은 안내를 쓴다.
  if (isNetworkError(error) || isAbortError(error)) {
    return NETWORK_FAILURE_MESSAGE
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
