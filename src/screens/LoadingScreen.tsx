import { RefreshCw } from 'lucide-react'

export function LoadingScreen() {
  return (
    <main className="center-screen loading-screen">
      <div className="loading-card">
        <RefreshCw className="spin" size={28} />
        <p>파트 업무관리 시스템을 불러오는 중입니다.</p>
        <div className="loading-skeleton-stack" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  )
}

