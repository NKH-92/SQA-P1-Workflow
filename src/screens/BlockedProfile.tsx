import { LogOut, ShieldCheck } from 'lucide-react'

export function BlockedProfile({ onSignOut, inactive }: { onSignOut?: () => void; inactive?: boolean }) {
  return (
    <main className="center-screen" role="alert">
      <ShieldCheck size={32} aria-hidden="true" />
      <h1>{inactive ? '계정이 비활성화되었습니다' : '초대 등록이 필요합니다'}</h1>
      <p>
        {inactive
          ? '파트장에게 계정 활성화를 요청하세요. 활성화 전까지 앱 데이터에 접근할 수 없습니다.'
          : '파트장에게 초대 등록을 요청하세요. 등록 후 다시 로그인하면 자동으로 연결됩니다.'}
      </p>
      {onSignOut && (
        <button className="primary" onClick={onSignOut} type="button">
          <LogOut size={16} />
          로그아웃
        </button>
      )}
    </main>
  )
}
