import React from 'react'
import { AlertTriangle, Home, RefreshCw } from 'lucide-react'
import { reportError } from '../lib/errorReporter'
import type { ErrorReportRole } from '../lib/errorReporter'

type ErrorBoundaryProps = {
  children: React.ReactNode
  /** 알려진 경우의 역할. 인증 전 등 알 수 없을 때는 기본값 'unknown'으로 보고된다. */
  role?: ErrorReportRole
}

type ErrorBoundaryState = {
  hasError: boolean
  /** 새 배포 뒤 예전 화면 조각을 받지 못한 경우. 이때는 화면 전체를 새로 불러와야 한다. */
  needsReload: boolean
}

const HOME_HASH = '#/dashboard'
const CHUNK_LOAD_ERROR = /dynamically imported module|Importing a module script failed|Loading chunk|ChunkLoadError/i

function isChunkLoadError(error: unknown) {
  if (!(error instanceof Error)) return false
  return error.name === 'ChunkLoadError' || CHUNK_LOAD_ERROR.test(error.message)
}

/**
 * 화면을 그리다 난 오류를 잡아 다시 시도하거나 홈으로 돌아갈 길을 준다(FBK-5).
 * 이 대체 화면은 셸의 <main> 안에도 놓이므로 <main>을 새로 만들지 않는다.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, needsReload: false }

  static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
    return { hasError: true, needsReload: isChunkLoadError(error) }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    reportError({
      error,
      route: typeof window !== 'undefined' ? window.location.hash || window.location.pathname : 'unknown',
      role: this.props.role ?? 'unknown',
      operation: 'render',
      context: info.componentStack ?? undefined,
    })
  }

  private retry = () => {
    if (this.state.needsReload) {
      window.location.reload()
      return
    }
    this.setState({ hasError: false, needsReload: false })
  }

  private goHome = () => {
    if (window.location.hash !== HOME_HASH) window.location.hash = HOME_HASH
    this.setState({ hasError: false, needsReload: false })
  }

  render() {
    if (this.state.hasError) {
      return (
        <section aria-labelledby="error-boundary-title" className="center-screen error-boundary">
          <AlertTriangle size={32} aria-hidden="true" />
          <div className="center-screen-message" role="alert">
            <h1 id="error-boundary-title">화면을 다시 불러와 주세요</h1>
            <p>
              {this.state.needsReload
                ? '새 버전이 배포돼 이 화면을 여는 데 필요한 파일이 바뀌었어요. 다시 시도하면 새로 불러와요.'
                : '이 화면을 보여 주다가 문제가 생겼어요. 다시 시도하면 대부분 해결돼요. 그래도 안 되면 홈으로 이동해 주세요.'}
            </p>
          </div>
          <div className="center-screen-actions">
            <button className="ghost" onClick={this.goHome} type="button">
              <Home size={16} aria-hidden="true" />
              홈으로
            </button>
            <button className="primary" onClick={this.retry} type="button">
              <RefreshCw size={16} aria-hidden="true" />
              다시 시도
            </button>
          </div>
        </section>
      )
    }

    return this.props.children
  }
}
