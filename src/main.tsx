import React from 'react'
import ReactDOM from 'react-dom/client'
// 폰트는 저장소에 셀프호스팅한다. 외부 CDN을 쓰지 않으므로 CSP(default-src 'self')와
// 사내망 인터넷 제한 환경에서도 안전하다. 브라우저는 unicode-range로 라틴 서브셋만 내려받는다.
// (한글 글리프는 어느 폰트에도 없으므로 시스템 폰트로 폴백된다 — 예시 목업과 동일한 동작.)
import '@fontsource-variable/newsreader'
import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './styles.css'

// 밀도 설정은 첫 페인트 전에 적용한다. Shell 마운트 후에 적용하면
// 압축 모드 사용자가 새로고침할 때마다 레이아웃이 한 번 출렁인다.
try {
  if (localStorage.getItem('ui:density') === 'compact') {
    document.documentElement.dataset.density = 'compact'
  }
} catch {
  // 저장소가 막힌 환경(사생활 보호 모드 등)에서는 기본 밀도로 시작한다.
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
