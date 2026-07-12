import { LogOut, RefreshCw, WifiOff } from 'lucide-react'

export function ProfileLoadErrorScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string
  onRetry: () => void
  onSignOut: () => void
}) {
  return (
    <main className="center-screen" role="alert">
      <WifiOff size={32} aria-hidden="true" />
      <h1>프로필을 불러오지 못했습니다</h1>
      <p>{message}</p>
      <button className="primary" onClick={onRetry} type="button">
        <RefreshCw size={16} />
        다시 시도
      </button>
      <button className="ghost" onClick={onSignOut} type="button">
        <LogOut size={16} />
        로그아웃
      </button>
    </main>
  )
}
