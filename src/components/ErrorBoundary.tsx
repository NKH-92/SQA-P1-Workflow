import React from 'react'
import { reportError } from '../lib/errorReporter'
import type { ErrorReportRole } from '../lib/errorReporter'

type ErrorBoundaryProps = {
  children: React.ReactNode
  /** 알려진 경우의 역할. 인증 전 등 알 수 없을 때는 기본값 'unknown'으로 보고된다. */
  role?: ErrorReportRole
}

type ErrorBoundaryState = {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
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

  render() {
    if (this.state.hasError) {
      return (
        <main className="center-screen">
          <h1>일시적인 오류가 발생했습니다</h1>
          <p>페이지를 새로고침하면 대부분 정상적으로 복구됩니다.</p>
          <button className="primary" onClick={() => window.location.reload()} type="button">
            새로고침
          </button>
        </main>
      )
    }

    return this.props.children
  }
}
