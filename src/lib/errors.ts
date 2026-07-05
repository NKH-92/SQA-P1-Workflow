type PostgrestErrorLike = {
  code?: string
  message?: string
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
  '23505': '이미 등록된 항목입니다.',
  '23503': '연결된 데이터가 있어 처리할 수 없습니다.',
  '42501': '권한이 없습니다.',
  PGRST301: '권한이 없습니다.',
}

export function toUserMessage(error: unknown): string {
  if (isNetworkError(error)) {
    console.error(error)
    return '서버에 연결하지 못했습니다. 잠시 후 다시 시도하세요.'
  }

  if (isPostgrestError(error)) {
    const mapped = error.code ? codeMessages[error.code] : undefined
    if (mapped) {
      console.error(error)
      return mapped
    }

    const message = error.message ?? ''
    if (/permission denied|row-level security/i.test(message)) {
      console.error(error)
      return '권한이 없습니다.'
    }
    if (/duplicate key|unique constraint/i.test(message)) {
      console.error(error)
      return '이미 등록된 항목입니다.'
    }
    if (/foreign key|violates foreign key/i.test(message)) {
      console.error(error)
      return '연결된 데이터가 있어 처리할 수 없습니다.'
    }
  }

  if (error instanceof Error) {
    const message = error.message
    if (/invalid login credentials/i.test(message)) {
      console.error(error)
      return '이메일 또는 비밀번호가 올바르지 않습니다.'
    }
    if (/email not confirmed/i.test(message)) {
      console.error(error)
      return '이메일 인증이 필요합니다. 받은 메일의 링크를 확인해 주세요.'
    }
    console.error(error)
    return message || '작업을 완료하지 못했습니다. 문제가 반복되면 관리자에게 문의하세요.'
  }

  console.error(error)
  return '작업을 완료하지 못했습니다. 문제가 반복되면 관리자에게 문의하세요.'
}
