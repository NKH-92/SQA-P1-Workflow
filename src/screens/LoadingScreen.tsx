import { RefreshCw } from 'lucide-react'

export function LoadingScreen() {
  return (
    <main className="center-screen loading-screen" aria-busy="true">
      <div className="loading-card" role="status" aria-live="polite">
        <RefreshCw className="spin" size={28} aria-hidden="true" />
        <p>SQA P1 Workflow를 불러오는 중입니다.</p>
        <div className="loading-skeleton-stack" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  )
}

