/** 첫 화면을 준비하는 동안의 자리 표시. 스피너 없이 스켈레톤 하나만 보여준다(토스 GR-9, FBK-3). */
export function LoadingScreen() {
  return (
    <main className="center-screen loading-screen" aria-busy="true">
      <div className="loading-card" role="status">
        <p>SQA P1 Workflow를 불러오고 있어요.</p>
        <div className="loading-skeleton-stack" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </main>
  )
}
