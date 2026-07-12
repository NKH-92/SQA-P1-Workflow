import { useState } from 'react'
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
          <p>계정 또는 로그인 정보가 필요하면 파트장에게 문의하세요. 이 화면에서는 로그인만 지원합니다.</p>
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
