import { useState } from 'react'
import type { Profile } from '../types'
import { PASSWORD_MIN_LENGTH } from '../app/constants'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import {
  LogOut,
  Save,
  ShieldCheck,
} from 'lucide-react'

type PasswordChangePanelProps = {
  profile: Profile
  onComplete: (profile: Profile) => void
  onSignOut: () => void
}

export function PasswordChangePanel({ profile, onComplete, onSignOut }: PasswordChangePanelProps) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  void profile
  void onComplete

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) return

    if (password.length < PASSWORD_MIN_LENGTH) {
      setNotice(`새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다.`)
      return
    }
    if (password !== confirmation) {
      setNotice('비밀번호 확인이 일치하지 않습니다.')
      return
    }
    if (password === '12345678') {
      setNotice('임시 비밀번호와 다른 새 비밀번호를 입력해 주세요.')
      return
    }

    setPending(true)
    setNotice(null)
    const { data, error: passwordError } = await supabase.functions.invoke('complete-password-change', {
      body: { password },
    })
    if (passwordError) {
      setPending(false)
      setNotice(toUserMessage(passwordError))
      return
    }
    if (!data?.ok) {
      setPending(false)
      setNotice(data?.message ?? '비밀번호를 변경하지 못했습니다.')
      return
    }
    setPassword('')
    setConfirmation('')
    setPending(false)
    onSignOut()
  }

  return (
    <main className="auth-layout">
      <section className="auth-copy">
        <ShieldCheck size={40} />
        <h1>비밀번호 변경 필요</h1>
        <p>{profile.name} 계정은 임시 비밀번호를 사용 중입니다. 업무 화면을 열기 전에 개인 비밀번호를 설정하세요.</p>
        <ul>
          <li>8자 이상으로 설정하세요.</li>
          <li>임시 비밀번호는 다시 사용할 수 없습니다.</li>
          <li>다음 로그인부터 새 비밀번호를 사용하세요.</li>
        </ul>
      </section>
      <form className="auth-form" onSubmit={submit}>
        <div>
          <h2>개인 비밀번호 설정</h2>
          <p>{profile.email}</p>
        </div>
        <label>
          새 비밀번호
          <input
            type="password"
            value={password}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        <label>
          새 비밀번호 확인
          <input
            type="password"
            value={confirmation}
            minLength={PASSWORD_MIN_LENGTH}
            onChange={(event) => setConfirmation(event.target.value)}
            required
          />
        </label>
        {notice && <p className="notice">{notice}</p>}
        <button className="primary" disabled={pending} type="submit">
          <Save size={16} />
          {pending ? '저장 중...' : '비밀번호 변경'}
        </button>
        <button className="ghost" disabled={pending} type="button" onClick={onSignOut}>
          <LogOut size={16} />
          로그아웃
        </button>
      </form>
    </main>
  )
}
