import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'
import { assertAllowedErrorReport, resetErrorReporter, setErrorReporter } from '../lib/errorReporter'

function Boom(): JSX.Element {
  throw new Error('boom: something exploded')
}

// React logs the caught error to the console by design — keep test output clean.
const originalConsoleError = console.error

afterEach(() => {
  cleanup()
  resetErrorReporter()
  console.error = originalConsoleError
})

describe('ErrorBoundary', () => {
  it('renders the recovery fallback instead of crashing the app', () => {
    console.error = vi.fn()
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    )

    expect(screen.getByText('일시적인 오류가 발생했습니다')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '새로고침' })).toBeInTheDocument()
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
    expect(report).toMatchObject({ role: 'unknown', operation: 'mutation' })
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
