import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ErrorReportRejectedError,
  assertAllowedErrorReport,
  buildErrorReport,
  computeErrorFingerprint,
  createConsoleErrorReporter,
  getBuildSha,
  getErrorReporter,
  loadBuildShaFromVersionFile,
  noopErrorReporter,
  reportError,
  resetErrorReporter,
  setBuildSha,
  setErrorReporter,
} from './errorReporter'

const validReport = {
  fingerprint: 'abcd1234',
  buildSha: 'a'.repeat(40),
  route: 'reviews',
  role: 'leader' as const,
  operation: '검토요청을 등록했습니다.',
  occurredAt: '2026-07-20T00:00:00.000Z',
}

afterEach(() => {
  resetErrorReporter()
  setBuildSha('unknown')
})

describe('assertAllowedErrorReport', () => {
  it('accepts a report containing exactly the allowed fields', () => {
    expect(assertAllowedErrorReport(validReport)).toEqual(validReport)
  })

  it('accepts a null operation', () => {
    expect(assertAllowedErrorReport({ ...validReport, operation: null })).toEqual({
      ...validReport,
      operation: null,
    })
  })

  it.each([
    ['review title/body', { title: '검토 제목' }],
    ['note/comment', { comment: '피드백 내용' }],
    ['email', { email: 'member@example.com' }],
    ['access token', { accessToken: 'sbp_secret' }],
    ['raw DB row data', { rowData: { id: '1', name: '김파트' } }],
    ['full user id', { userId: '11111111-1111-1111-1111-111111111111' }],
    ['requester name', { requesterName: '김파트' }],
  ])('rejects a report carrying a PII-like %s field', (_label, extra) => {
    expect(() => assertAllowedErrorReport({ ...validReport, ...extra })).toThrow(ErrorReportRejectedError)
  })

  it('rejects a report missing a required field', () => {
    const { route: _route, ...withoutRoute } = validReport
    expect(() => assertAllowedErrorReport(withoutRoute)).toThrow(ErrorReportRejectedError)
  })

  it('rejects non-object values', () => {
    expect(() => assertAllowedErrorReport(null)).toThrow(ErrorReportRejectedError)
    expect(() => assertAllowedErrorReport('oops')).toThrow(ErrorReportRejectedError)
    expect(() => assertAllowedErrorReport([validReport])).toThrow(ErrorReportRejectedError)
  })

  it('rejects an invalid role', () => {
    expect(() => assertAllowedErrorReport({ ...validReport, role: 'admin' })).toThrow(ErrorReportRejectedError)
  })

  it('rejects a non-ISO occurredAt', () => {
    expect(() => assertAllowedErrorReport({ ...validReport, occurredAt: 'not-a-date' })).toThrow(
      ErrorReportRejectedError,
    )
  })
})

describe('computeErrorFingerprint', () => {
  it('never echoes the raw error message or emails/uuids into the fingerprint', () => {
    const error = new Error('duplicate key value violates unique constraint "profiles_email_key" (email)=(member@example.com)')
    const fingerprint = computeErrorFingerprint(error)
    expect(fingerprint).toMatch(/^[0-9a-f]{8}$/)
    expect(fingerprint).not.toContain('@')
    expect(fingerprint).not.toContain('member')
  })

  it('is stable for the same error shape and differs for a different one', () => {
    const first = computeErrorFingerprint(new TypeError('Failed to fetch'))
    const second = computeErrorFingerprint(new TypeError('Failed to fetch'))
    const third = computeErrorFingerprint(new RangeError('Failed to fetch'))
    expect(first).toBe(second)
    expect(first).not.toBe(third)
  })

  it('folds an additional context signal (e.g. componentStack) into the hash without leaking it', () => {
    const error = new Error('boom')
    const withContext = computeErrorFingerprint(error, 'at ReviewsPanel (ReviewsPanel.tsx:42)')
    const withoutContext = computeErrorFingerprint(error)
    expect(withContext).not.toBe(withoutContext)
  })
})

describe('buildErrorReport', () => {
  it('produces an allowlisted report using the cached build SHA', () => {
    setBuildSha('b'.repeat(40))
    const report = buildErrorReport({
      error: new Error('boom'),
      route: 'reviews?request=secret-id',
      role: 'member',
      operation: '검토요청을 등록했습니다.',
      now: () => new Date('2026-07-20T09:00:00.000Z'),
    })

    expect(report).toEqual({
      fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/),
      buildSha: 'b'.repeat(40),
      route: 'reviews',
      role: 'member',
      operation: 'mutation',
      occurredAt: '2026-07-20T09:00:00.000Z',
    })
  })
})

describe('error reporter adapters', () => {
  it('noopErrorReporter does nothing', () => {
    expect(() => noopErrorReporter.report(validReport)).not.toThrow()
  })

  it('createConsoleErrorReporter logs through the given logger', () => {
    const logger = { error: vi.fn() }
    createConsoleErrorReporter(logger).report(validReport)
    expect(logger.error).toHaveBeenCalledWith('[error-report]', validReport)
  })

  it('createConsoleErrorReporter still enforces the allowlist as a defense in depth', () => {
    const logger = { error: vi.fn() }
    expect(() =>
      createConsoleErrorReporter(logger).report({ ...validReport, email: 'member@example.com' } as never),
    ).toThrow(ErrorReportRejectedError)
    expect(logger.error).not.toHaveBeenCalled()
  })

  it('defaults to the console adapter and can be swapped via setErrorReporter', () => {
    expect(getErrorReporter().report).toBeTypeOf('function')
    const custom = { report: vi.fn() }
    setErrorReporter(custom)
    expect(getErrorReporter()).toBe(custom)
  })
})

describe('reportError', () => {
  it('delivers a valid report to the active reporter', () => {
    const reporter = { report: vi.fn() }
    setErrorReporter(reporter)
    setBuildSha('c'.repeat(40))

    reportError({
      error: new Error('boom'),
      route: 'reviews',
      role: 'leader',
      operation: null,
      now: () => new Date('2026-07-20T09:00:00.000Z'),
    })

    expect(reporter.report).toHaveBeenCalledTimes(1)
    expect(reporter.report).toHaveBeenCalledWith(
      expect.objectContaining({ buildSha: 'c'.repeat(40), route: 'reviews', role: 'leader', operation: null }),
    )
  })

  it('never throws even if the active reporter itself fails', () => {
    setErrorReporter({
      report: () => {
        throw new Error('adapter is down')
      },
    })

    expect(() =>
      reportError({ error: new Error('boom'), route: 'reviews', role: 'unknown', operation: null }),
    ).not.toThrow()
  })
})

describe('error operation taxonomy', () => {
  it('keeps render errors distinct while reducing arbitrary mutation labels', () => {
    const base = {
      error: new Error('boom'),
      route: 'reviews',
      role: 'unknown' as const,
      now: () => new Date('2026-07-20T09:00:00.000Z'),
    }
    expect(buildErrorReport({ ...base, operation: 'render' }).operation).toBe('render')
    expect(buildErrorReport({ ...base, operation: 'activity-log-write' }).operation).toBe('activity-log-write')
    expect(buildErrorReport({ ...base, operation: '검토요청을 저장했습니다.' }).operation).toBe('mutation')
  })
})

describe('loadBuildShaFromVersionFile', () => {
  it('adopts a valid SHA from /version.json', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ sha: 'd'.repeat(40) }),
    })) as unknown as typeof fetch

    const sha = await loadBuildShaFromVersionFile(fetchImpl)

    expect(sha).toBe('d'.repeat(40))
    expect(getBuildSha()).toBe('d'.repeat(40))
    expect(fetchImpl).toHaveBeenCalledWith('/version.json', { cache: 'no-store' })
  })

  it('keeps the cached SHA when the response is not ok', async () => {
    setBuildSha('e'.repeat(40))
    const fetchImpl = vi.fn(async () => ({ ok: false, json: async () => ({}) })) as unknown as typeof fetch

    expect(await loadBuildShaFromVersionFile(fetchImpl)).toBe('e'.repeat(40))
  })

  it('ignores a malformed SHA and network failures without throwing', async () => {
    setBuildSha('f'.repeat(40))
    const malformed = vi.fn(async () => ({ ok: true, json: async () => ({ sha: 'not-a-sha' }) })) as unknown as typeof fetch
    expect(await loadBuildShaFromVersionFile(malformed)).toBe('f'.repeat(40))

    const throwing = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    await expect(loadBuildShaFromVersionFile(throwing)).resolves.toBe('f'.repeat(40))
  })
})
