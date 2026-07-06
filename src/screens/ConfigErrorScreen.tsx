import { AlertTriangle } from 'lucide-react'

export function ConfigErrorScreen() {
  return (
    <main className="center-screen" role="alert">
      <AlertTriangle size={32} aria-hidden="true" />
      <h1>로그인 설정 오류</h1>
      <p>
        Supabase 연결 정보가 설정되지 않았습니다. 운영 환경에서는 <code>VITE_SUPABASE_URL</code>과{' '}
        <code>VITE_SUPABASE_ANON_KEY</code>를 반드시 설정하세요.
      </p>
      <p>
        로컬 데모 미리보기만 필요하면 <code>VITE_APP_MODE=preview</code>로 빌드하세요.
      </p>
    </main>
  )
}
