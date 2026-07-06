import { useState } from 'react'
import { TEMP_PASSWORD_MIN_LENGTH } from '../app/constants'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import { Send, ShieldCheck } from 'lucide-react'

export function AuthPanel() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return
    setPending(true)
    setNotice(null)
    const result = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    setPending(false)
    if (result.error) {
      setNotice(toUserMessage(result.error))
      return
    }
    setNotice('로그인했습니다.')
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
          <h2>로그인</h2>
          <p>
            계정은 파트장 초대 후 Supabase에서 생성됩니다. 로그인만 가능합니다. 파트장이 등록한 이메일만 사용할
            수 있습니다. 최초 비밀번호는 1234이며, 로그인 후 비밀번호 변경이 필요합니다.
          </p>
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
            minLength={TEMP_PASSWORD_MIN_LENGTH}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={pending} type="submit">
          <Send size={16} />
          로그인
        </button>
      </form>
    </main>
  )
}
