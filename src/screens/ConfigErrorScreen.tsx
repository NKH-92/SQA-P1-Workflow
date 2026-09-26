import { useId } from 'react'
import { AlertTriangle } from 'lucide-react'

/** 운영 설정이 빠진 배포에서만 보이는 화면. 배포 담당자가 할 일을 먼저 알려준다. */
export function ConfigErrorScreen() {
  const titleId = useId()
  return (
    <main aria-labelledby={titleId} className="center-screen">
      <AlertTriangle size={32} aria-hidden="true" />
      <div className="center-screen-message" role="alert">
        <h1 id={titleId}>로그인 설정을 마쳐 주세요</h1>
        <p>
          로그인 서버 연결 정보가 없어서 로그인할 수 없어요. 운영 환경에서는 <code>VITE_SUPABASE_URL</code>과{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>를 설정해 주세요.
        </p>
        <p>
          로컬 데모 미리보기만 필요하면 <code>VITE_APP_MODE=preview</code>로 빌드해 주세요.
        </p>
      </div>
    </main>
  )
}
