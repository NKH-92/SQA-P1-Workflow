import { useId, useState } from 'react'
import type { Profile } from '../types'
import { PASSWORD_MIN_LENGTH } from '../app/constants'
import { supabase } from '../lib/supabase'
import { LogOut, ShieldCheck } from 'lucide-react'
import { writePasswordChangedFlag } from './passwordChangedNotice'

type PasswordChangePanelProps = {
  profile: Profile
  /** 바꾼 뒤에는 다시 로그인하게 하므로 지금은 쓰지 않는다(App 계약 유지용). */
  onComplete: (profile: Profile) => void
  onSignOut: () => void
}

const TEMPORARY_PASSWORD = '12345678'
const MISMATCH_MESSAGE = '두 비밀번호가 달라요. 같은 비밀번호를 한 번 더 입력해 주세요.'
const GENERIC_MESSAGE = '비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.'

/** 서버(complete-password-change)가 돌려주는 오류 코드별 안내. 영문 원문은 보여주지 않는다. */
const serverErrorMessages: Record<string, string> = {
  password_too_short: `새 비밀번호를 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`,
  temporary_password_reuse: '임시 비밀번호와 다른 비밀번호를 입력해 주세요.',
  authentication_required: '로그인 정보가 만료됐어요. 다시 로그인한 뒤 비밀번호를 바꿔 주세요.',
  password_change_failed: '이 비밀번호로는 바꿀 수 없어요. 더 길거나 다른 비밀번호로 다시 시도해 주세요.',
  password_change_not_prepared: GENERIC_MESSAGE,
  internal_error: GENERIC_MESSAGE,
}

async function passwordChangeErrorMessage(error: unknown, data: unknown): Promise<string> {
  const bodyCode = (body: unknown) =>
    body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
      ? (body as { error: string }).error
      : null
  let code = bodyCode(data)
  const context = (error as { context?: unknown } | null)?.context
  if (!code && context && typeof (context as Response).clone === 'function') {
    try {
      code = bodyCode(await (context as Response).clone().json())
    } catch {
      code = null
    }
  }
  if (code && serverErrorMessages[code]) return serverErrorMessages[code]
  if ((error as { name?: unknown } | null)?.name === 'FunctionsFetchError') {
    return '서버에 연결하지 못했어요. 네트워크를 확인하고 다시 시도해 주세요.'
  }
  return GENERIC_MESSAGE
}

/** 확인 칸이 새 비밀번호와 어긋나기 시작하면 바로 알려준다(다 입력하기 전 일치하는 앞부분은 기다린다). */
function confirmationMismatch(password: string, confirmation: string) {
  if (!confirmation) return false
  if (confirmation.length >= password.length) return confirmation !== password
  return !password.startsWith(confirmation)
}

export function PasswordChangePanel({ profile, onComplete, onSignOut }: PasswordChangePanelProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const passwordId = useId()
  const passwordHintId = useId()
  const confirmationId = useId()
  const confirmationHintId = useId()
  const noticeId = useId()
  void onComplete

  const mismatch = confirmationMismatch(password, confirmation)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return

    if (password.length < PASSWORD_MIN_LENGTH) {
      setNotice(`새 비밀번호를 ${PASSWORD_MIN_LENGTH}자 이상으로 입력해 주세요.`)
      return
    }
    if (password !== confirmation) {
      setNotice(MISMATCH_MESSAGE)
      return
    }
    if (password === TEMPORARY_PASSWORD) {
      setNotice('임시 비밀번호와 다른 비밀번호를 입력해 주세요.')
      return
    }

    setPending(true)
    setNotice(null)
    try {
      const { data, error: passwordError } = await supabase.functions.invoke('complete-password-change', {
        body: { password },
      })
      if (passwordError || !data?.ok) {
        setPending(false)
        setNotice(await passwordChangeErrorMessage(passwordError, data))
        return
      }
    } catch (error) {
      setPending(false)
      setNotice(await passwordChangeErrorMessage(error, null))
      return
    }
    setPassword('')
    setConfirmation('')
    setPending(false)
    // 보안을 위해 로그아웃한 뒤 로그인 화면에서 “비밀번호를 바꿨어요”를 한 번 보여주고 이메일을 채운다.
    writePasswordChangedFlag(profile.email)
    onSignOut()
  }

  return (
    <main className="auth-layout">
      <section className="auth-copy">
        <ShieldCheck aria-hidden="true" size={40} />
        <h1>비밀번호 변경 필요</h1>
        <p>
          {profile.name}님은 지금 임시 비밀번호로 로그인했어요. 새 비밀번호를 만들고 다시 로그인하면 업무 화면을 쓸 수 있어요.
        </p>
        <ul>
          <li>{PASSWORD_MIN_LENGTH}자 이상으로 만들어 주세요</li>
          <li>임시 비밀번호와 다른 비밀번호를 써 주세요</li>
          <li>바꾼 뒤에는 새 비밀번호로 다시 로그인해요</li>
        </ul>
      </section>
      <form aria-busy={pending} className="auth-form" noValidate onSubmit={submit}>
        <div>
          <h2>새 비밀번호 만들기</h2>
          <p>{profile.email}</p>
        </div>
        <div className="auth-field">
          <label htmlFor={passwordId}>새 비밀번호</label>
          <input
            aria-describedby={passwordHintId}
            autoComplete="new-password"
            autoFocus
            disabled={pending}
            id={passwordId}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setPassword(event.target.value)}
            required
            type={showPassword ? 'text' : 'password'}
            value={password}
          />
          <small className="auth-field-hint" id={passwordHintId}>
            {PASSWORD_MIN_LENGTH}자 이상, 임시 비밀번호와 다르게 만들어 주세요.
          </small>
        </div>
        <div className="auth-field">
          <label htmlFor={confirmationId}>새 비밀번호 확인</label>
          <input
            aria-describedby={confirmationHintId}
            aria-invalid={mismatch ? true : undefined}
            autoComplete="new-password"
            disabled={pending}
            id={confirmationId}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            type={showPassword ? 'text' : 'password'}
            value={confirmation}
          />
          <small
            aria-live="polite"
            className={mismatch ? 'auth-field-hint error' : 'auth-field-hint'}
            id={confirmationHintId}
          >
            {mismatch
              ? MISMATCH_MESSAGE
              : confirmation && confirmation === password
                ? '두 비밀번호가 같아요.'
                : '같은 비밀번호를 한 번 더 입력해 주세요.'}
          </small>
        </div>
        <label className="auth-show-password">
          <input checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} type="checkbox" />
          입력한 비밀번호 보기
        </label>
        {notice && (
          <p className="notice error" id={noticeId} role="alert">
            {notice}
          </p>
        )}
        <button className="primary" disabled={pending} type="submit">
          {pending ? '저장하는 중…' : '비밀번호 변경'}
        </button>
        <button className="ghost" disabled={pending} type="button" onClick={onSignOut}>
          <LogOut size={16} aria-hidden="true" />
          로그아웃
        </button>
      </form>
    </main>
  )
}
