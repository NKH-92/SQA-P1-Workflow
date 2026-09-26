import { useId } from 'react'
import { AlertTriangle, LogOut, RefreshCw } from 'lucide-react'

/** 로그인 뒤 프로필을 불러오지 못한 경우. 제목은 할 일, 설명은 이유, 버튼은 다시 시도. */
export function ProfileLoadErrorScreen({
  message,
  onRetry,
  onSignOut,
}: {
  message: string
  onRetry: () => void
  onSignOut: () => void
}) {
  const titleId = useId()
  return (
    <main aria-labelledby={titleId} className="center-screen">
      <AlertTriangle size={32} aria-hidden="true" />
      <div className="center-screen-message" role="alert">
        <h1 id={titleId}>프로필을 다시 불러와 주세요</h1>
        <p>{message}</p>
      </div>
      <div className="center-screen-actions">
        <button className="ghost" onClick={onSignOut} type="button">
          <LogOut size={16} aria-hidden="true" />
          로그아웃
        </button>
        <button className="primary" onClick={onRetry} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          다시 시도
        </button>
      </div>
    </main>
  )
}
