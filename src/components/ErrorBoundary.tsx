import React from 'react'

type ErrorBoundaryState = {
  hasError: boolean
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Unhandled render error', error, info)
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
