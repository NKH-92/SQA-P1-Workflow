import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'
import { assertAllowedErrorReport, resetErrorReporter, setErrorReporter } from '../lib/errorReporter'

function Boom(): JSX.Element {
  throw new Error('boom: something exploded')
}

/** 처음 한 번만 실패하는 화면(다시 시도 확인용) */
const flaky = { fail: true }
function Flaky() {
  if (flaky.fail) throw new Error('first render fails')
  return <p>다시 그린 화면</p>
}

function ChunkBoom(): JSX.Element {
  throw new TypeError('Failed to fetch dynamically imported module: /assets/Projects-abc.js')
}

// React logs the caught error to the console by design — keep test output clean.
const originalConsoleError = console.error

afterEach(() => {
  cleanup()
  resetErrorReporter()
  console.error = originalConsoleError
  window.history.replaceState(null, '', '#/')
})

describe('ErrorBoundary', () => {
  it('renders a recovery fallback with retry and home actions instead of crashing the app', () => {
    console.error = vi.fn()
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { level: 1, name: '화면을 다시 불러와 주세요' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '홈으로' })).toBeInTheDocument()
    // 셸의 <main> 안에 놓여도 랜드마크가 겹치지 않는다.
    expect(container.querySelector('main')).toBeNull()
  })

  it('re-renders the screen when retried', async () => {
    const user = userEvent.setup()
    console.error = vi.fn()
    flaky.fail = true
    render(
      <ErrorBoundary>
        <Flaky />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('button', { name: '다시 시도' })).toBeInTheDocument()
    flaky.fail = false
    await user.click(screen.getByRole('button', { name: '다시 시도' }))
    expect(screen.getByText('다시 그린 화면')).toBeInTheDocument()
  })

  it('goes back to the home route', async () => {
    const user = userEvent.setup()
    console.error = vi.fn()
    window.history.replaceState(null, '', '#/projects')
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: '홈으로' }))
    expect(window.location.hash).toBe('#/dashboard')
  })

  it('explains a stale deploy when a screen chunk cannot be loaded', () => {
    console.error = vi.fn()
    render(
      <ErrorBoundary>
        <ChunkBoom />
      </ErrorBoundary>,
    )

    expect(screen.getByText(/새 버전이 배포돼/)).toBeInTheDocument()
  })

  it('reports a well-formed, allowlisted ErrorReport with role unknown by default', () => {
    console.error = vi.fn()
    const reporter = { report: vi.fn() }
    setErrorReporter(reporter)

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(reporter.report).toHaveBeenCalledTimes(1)
    const report = reporter.report.mock.calls[0][0]
    expect(() => assertAllowedErrorReport(report)).not.toThrow()
    expect(report).toMatchObject({ role: 'unknown', operation: 'render' })
    expect(JSON.stringify(report)).not.toContain('boom: something exploded')
  })

  it('reports the given role when provided', () => {
    console.error = vi.fn()
    const reporter = { report: vi.fn() }
    setErrorReporter(reporter)

    render(
      <ErrorBoundary role="leader">
        <Boom />
      </ErrorBoundary>,
    )

    expect(reporter.report.mock.calls[0][0]).toMatchObject({ role: 'leader' })
  })
})
