import { UserFacingError } from '../../../lib/errors'

type AccountAdminAction = 'create' | 'reset_password'

/**
 * 계정 관리 서버 함수(account-admin)가 돌려주는 오류 코드를 사용자가 할 일로 바꾼다.
 * 일반 Error로 던지면 공통 오류 문구(‘요청을 처리하지 못했어요’)로 뭉개져 실제 이유가 사라진다(FBK-2).
 * 서버 원문 메시지(message)는 내부 정보가 섞일 수 있어 보여주지 않는다.
 */
const messages: Record<string, string> = {
  authentication_required: '로그인이 만료됐어요. 다시 로그인한 뒤 시도해 주세요.',
  active_leader_required: '파트장만 계정을 관리할 수 있어요. 필요하면 파트장에게 요청해 주세요.',
  invalid_account_input: '이메일 형식과 이름(100자 이하)을 확인해 주세요.',
  invalid_role: '역할을 다시 골라 주세요.',
  account_already_exists: '이미 가입한 이메일이에요. 목록에서 그 계정을 찾아 확인해 주세요.',
  account_creation_failed: '계정을 만들지 못했어요. 이메일이 맞는지 확인하고 다시 시도해 주세요.',
  invalid_reset_input: '초기화 사유를 500자 이하로 적어 주세요.',
  password_reset_not_prepared: '비밀번호를 초기화할 수 없는 계정이에요. 활성 상태인 계정인지 확인해 주세요.',
  password_reset_failed: '비밀번호를 초기화하지 못했어요. 잠시 후 다시 시도해 주세요.',
}

const fallback: Record<AccountAdminAction, string> = {
  create: '계정을 만들지 못했어요. 잠시 후 다시 시도하고, 계속되면 관리자에게 알려 주세요.',
  reset_password: '비밀번호를 초기화하지 못했어요. 잠시 후 다시 시도하고, 계속되면 관리자에게 알려 주세요.',
}

export function accountAdminErrorMessage(code: string | null | undefined, action: AccountAdminAction) {
  return (code && messages[code]) || fallback[action]
}

/** 서버 함수 응답 본문에서 오류 코드를 읽는다. 비정상 응답(4xx/5xx)은 error.context가 Response다. */
async function readErrorCode(error: unknown): Promise<string | null> {
  if (!error || typeof error !== 'object') return null
  const context = (error as { context?: unknown }).context
  if (!context || typeof context !== 'object' || typeof (context as Response).json !== 'function') return null
  try {
    const body: unknown = await (context as Response).clone().json()
    if (body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string') {
      return (body as { error: string }).error
    }
  } catch {
    // 본문이 JSON이 아니면 코드 없이 기본 문구를 쓴다.
  }
  return null
}

function isNetworkFailure(error: unknown) {
  if (!error || typeof error !== 'object') return false
  const name = (error as { name?: unknown }).name
  return name === 'FunctionsFetchError' || name === 'FunctionsRelayError'
}

/** invoke 결과를 검사하고, 실패면 이유가 담긴 UserFacingError를 던진다. */
export async function assertAccountAdminResult(
  result: { data: unknown; error: unknown },
  action: AccountAdminAction,
) {
  if (result.error) {
    if (isNetworkFailure(result.error)) {
      throw new UserFacingError('계정 서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.')
    }
    throw new UserFacingError(accountAdminErrorMessage(await readErrorCode(result.error), action))
  }
  const body = result.data as { ok?: unknown; error?: unknown } | null
  if (!body || body.ok !== true) {
    throw new UserFacingError(accountAdminErrorMessage(typeof body?.error === 'string' ? body.error : null, action))
  }
}
