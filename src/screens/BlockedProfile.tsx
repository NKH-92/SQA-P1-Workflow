import { useId } from 'react'
import { LogOut, RefreshCw, ShieldCheck } from 'lucide-react'

/**
 * 로그인은 됐지만 앱을 쓸 수 없는 계정. 제목은 할 일, 설명은 이유(토스 UX 라이팅 UW-4).
 * 파트장이 계정을 활성화·등록한 뒤에는 ‘다시 확인하기’로 바로 들어올 수 있다.
 */
export function BlockedProfile({
  onSignOut,
  onRetry,
  inactive,
}: {
  onSignOut?: () => void
  /** 계정 상태를 다시 확인한다. 넘기지 않으면 화면을 새로 불러 다시 확인한다. */
  onRetry?: () => void
  inactive?: boolean
}) {
  const titleId = useId()
  const retry = onRetry ?? (() => window.location.reload())

  return (
    <main aria-labelledby={titleId} className="center-screen">
      <ShieldCheck size={32} aria-hidden="true" />
      <div className="center-screen-message">
        <h1 id={titleId}>{inactive ? '파트장에게 활성화를 요청해 주세요' : '파트장에게 계정 등록을 요청해 주세요'}</h1>
        <p>
          {inactive
            ? '계정이 비활성 상태예요. 활성화되면 바로 쓸 수 있어요.'
            : '아직 등록되지 않은 계정이라 앱에 접근할 수 없어요. 등록되면 다시 로그인해서 바로 쓸 수 있어요.'}
        </p>
      </div>
      <div className="center-screen-actions">
        {onSignOut && (
          <button className="ghost" onClick={onSignOut} type="button">
            <LogOut size={16} aria-hidden="true" />
            로그아웃
          </button>
        )}
        <button className="primary" onClick={retry} type="button">
          <RefreshCw size={16} aria-hidden="true" />
          다시 확인하기
        </button>
      </div>
    </main>
  )
}
