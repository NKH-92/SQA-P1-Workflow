import { useState } from 'react'
import { PASSWORD_MIN_LENGTH, TEMP_PASSWORD_MIN_LENGTH } from '../app/constants'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import {
  Send,
  ShieldCheck,
} from 'lucide-react'

export function AuthPanel() {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const passwordMinLength = mode === 'signIn' ? TEMP_PASSWORD_MIN_LENGTH : PASSWORD_MIN_LENGTH

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setPending(true)
    setNotice(null)
    const result =
      mode === 'signIn'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({ email, password })
    setPending(false)
    if (result.error) {
      setNotice(toUserMessage(result.error))
      return
    }
    setNotice(
      mode === 'signUp'
        ? '가입 요청이 접수되었습니다. 허용 이메일인 경우 확인 후 사용할 수 있습니다.'
        : '로그인했습니다.',
    )
  }

  return (
    <main className="auth-layout">
      <section className="auth-copy">
        <ShieldCheck size={40} />
        <h1>SQA P1 Workflow</h1>
        <p>우리 팀의 업무 배정, 검토 요청, 프로젝트 현황을 한 곳에서 관리하세요.</p>
        <ul>
          <li>팀 전체의 담당제품·업무를 한눈에 확인</li>
          <li>검토 요청과 피드백을 빠르게 주고받기</li>
          <li>프로젝트 배정과 마감 현황 실시간 관리</li>
        </ul>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <h2>{mode === 'signIn' ? '로그인' : '초대 이메일로 가입'}</h2>
          <p>파트장이 등록한 이메일만 프로필이 생성됩니다.</p>
        </div>
        <label>
          이메일
          <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
        </label>
        <label>
          비밀번호
          <input
            type="password"
            value={password}
            minLength={passwordMinLength}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={pending} type="submit">
          <Send size={16} />
          {mode === 'signIn' ? '로그인' : '가입 요청'}
        </button>
        <button className="ghost" type="button" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>
          {mode === 'signIn' ? '가입 화면으로 전환' : '로그인 화면으로 전환'}
        </button>
      </form>
    </main>
  )
}

