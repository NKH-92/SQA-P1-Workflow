import { useState } from 'react'
import type { Profile } from '../types'
import { PASSWORD_MIN_LENGTH } from '../app/constants'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
import {
  LogOut,
  RefreshCw,
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
  const [passwordChanged, setPasswordChanged] = useState(false)
  const [retryingCompletion, setRetryingCompletion] = useState(false)

  const completePasswordChange = async () => {
    if (!supabase) return false

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const { data: updatedProfile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', profile.id)
        .maybeSingle()
      if (!profileError && updatedProfile && updatedProfile.must_change_password === false) {
        onComplete(updatedProfile as Profile)
        return true
      }
      if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 250))
    }
    setNotice('비밀번호 변경은 완료됐지만 계정 상태 확인이 지연되고 있습니다. 새 비밀번호로 다시 로그인하거나 상태 확인을 재시도하세요.')
    return false
  }

  const retryCompletion = async () => {
    if (!supabase) return
    setRetryingCompletion(true)
    setNotice(null)
    await completePasswordChange()
    setRetryingCompletion(false)
  }

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

    setPending(true)
    setNotice(null)
    setPasswordChanged(false)
    const { error: passwordError } = await supabase.auth.updateUser({ password })
    if (passwordError) {
      setPending(false)
      setNotice(toUserMessage(passwordError))
      return
    }

    setPasswordChanged(true)
    const ok = await completePasswordChange()
    setPending(false)
    if (!ok) return
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
        <button className="primary" disabled={pending || retryingCompletion} type="submit">
          <Save size={16} />
          {pending ? '저장 중...' : '비밀번호 변경'}
        </button>
        {passwordChanged && notice && (
          <button className="ghost" disabled={pending || retryingCompletion} onClick={() => void retryCompletion()} type="button">
            <RefreshCw size={16} />
            {retryingCompletion ? '완료 처리 재시도 중...' : '완료 처리 재시도'}
          </button>
        )}
        <button className="ghost" disabled={pending || retryingCompletion} type="button" onClick={onSignOut}>
          <LogOut size={16} />
          로그아웃
        </button>
      </form>
    </main>
  )
}
