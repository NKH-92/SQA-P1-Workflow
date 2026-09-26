/**
 * 비밀번호를 바꾼 직후에는 보안을 위해 로그아웃한다(원격 E2E가 기대하는 흐름).
 * 그 사이 안내가 끊기지 않도록, 로그인 화면이 한 번만 읽고 지우는 표시를 세션 저장소에 남긴다.
 */
export const PASSWORD_CHANGED_FLAG_KEY = 'sqa.auth.passwordChanged'

export const PASSWORD_CHANGED_MESSAGE = '비밀번호를 바꿨어요. 새 비밀번호로 다시 로그인해 주세요.'

export type PasswordChangedFlag = { email: string }

function storage() {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage
  } catch {
    return null
  }
}

export function writePasswordChangedFlag(email: string) {
  try {
    storage()?.setItem(PASSWORD_CHANGED_FLAG_KEY, JSON.stringify({ email } satisfies PasswordChangedFlag))
  } catch {
    // 저장소를 쓸 수 없으면 안내 없이 로그인 화면으로 돌아갈 뿐이다.
  }
}

export function readPasswordChangedFlag(): PasswordChangedFlag | null {
  try {
    const raw = storage()?.getItem(PASSWORD_CHANGED_FLAG_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && typeof (parsed as PasswordChangedFlag).email === 'string') {
      return { email: (parsed as PasswordChangedFlag).email }
    }
    return null
  } catch {
    return null
  }
}

export function clearPasswordChangedFlag() {
  try {
    storage()?.removeItem(PASSWORD_CHANGED_FLAG_KEY)
  } catch {
    // 지우지 못해도 다음 로그인에서 한 번 더 보일 뿐이다.
  }
}
