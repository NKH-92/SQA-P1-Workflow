import { useEffect, useId, useState } from 'react'
import { Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import {
  clearPasswordChangedFlag,
  PASSWORD_CHANGED_MESSAGE,
  readPasswordChangedFlag,
} from './passwordChangedNotice'

type AuthNotice = {
  text: string
  tone: 'success' | 'error'
}

export function AuthPanel() {
  // 비밀번호를 바꾸고 막 돌아온 경우: 안내를 한 번 보여주고 이메일을 미리 채운다.
  const [passwordChanged] = useState(() => readPasswordChangedFlag())
  const [email, setEmail] = useState(() => passwordChanged?.email ?? '')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [notice, setNotice] = useState<AuthNotice | null>(() =>
    passwordChanged ? { text: PASSWORD_CHANGED_MESSAGE, tone: 'success' } : null,
  )
  const [pending, setPending] = useState(false)
  const emailId = useId()
  const passwordId = useId()
  const noticeId = useId()

  useEffect(() => {
    // 읽은 뒤 바로 지워 새로고침하면 다시 보이지 않게 한다(StrictMode 이중 실행에도 안전).
    if (passwordChanged) clearPasswordChangedFlag()
  }, [passwordChanged])

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) {
      setNotice({ text: '지금은 로그인할 수 없어요. 관리자에게 로그인 설정을 확인해 달라고 알려 주세요.', tone: 'error' })
      return
    }

    setPending(true)
    setNotice(null)
    try {
      const result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
      if (result.error) {
        setNotice({ text: toUserMessage(result.error), tone: 'error' })
        return
      }
      setNotice({ text: '로그인했어요.', tone: 'success' })
    } catch (error) {
      setNotice({ text: toUserMessage(error), tone: 'error' })
    } finally {
      setPending(false)
    }
  }

  const noticeIsError = notice?.tone === 'error'

  return (
    <main className="auth-layout">
      <section className="auth-copy">
        <ShieldCheck aria-hidden="true" size={40} />
        <h1>SQA P1 Workflow</h1>
        <p>우리 파트의 업무 배정, 검토요청, 프로젝트 현황을 한곳에서 관리해요.</p>
        <ul>
          <li>파트 전체의 담당 제품과 업무를 한눈에 봐요</li>
          <li>검토요청과 피드백을 빠르게 주고받아요</li>
          <li>프로젝트 담당자와 마감일을 바로 확인해요</li>
        </ul>
      </section>
      <form aria-busy={pending} className="auth-form" onSubmit={submit}>
        <div>
          <h2>로그인</h2>
          <p>계정이나 비밀번호가 필요하면 파트장에게 요청해 주세요.</p>
        </div>
        {notice && (
          <p
            className={noticeIsError ? 'notice error' : 'notice'}
            id={noticeId}
            role={noticeIsError ? 'alert' : 'status'}
          >
            {notice.text}
          </p>
        )}
        <div className="auth-field">
          <label htmlFor={emailId}>이메일</label>
          <input
            aria-describedby={noticeIsError ? noticeId : undefined}
            aria-invalid={noticeIsError ? true : undefined}
            autoComplete="username"
            autoFocus={!passwordChanged}
            disabled={pending}
            id={emailId}
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </div>
        <div className="auth-field">
          <label htmlFor={passwordId}>비밀번호</label>
          <div className="auth-password">
            <input
              aria-describedby={noticeIsError ? noticeId : undefined}
              aria-invalid={noticeIsError ? true : undefined}
              autoComplete="current-password"
              autoFocus={Boolean(passwordChanged)}
              disabled={pending}
              id={passwordId}
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button
              aria-controls={passwordId}
              aria-label={showPassword ? '비밀번호 숨기기' : '비밀번호 보기'}
              className="ghost compact auth-password-toggle"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              {showPassword ? <EyeOff aria-hidden="true" size={15} /> : <Eye aria-hidden="true" size={15} />}
              {showPassword ? '숨기기' : '보기'}
            </button>
          </div>
        </div>
        <button className="primary" disabled={pending} type="submit">
          {pending ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </main>
  )
}
