/**
 * 오류 관측성 abstraction. ErrorBoundary와 주요 network path(mutation runner)가
 * 동일한 인터페이스로 오류를 보고한다. 초기 adapter는 콘솔뿐이며, 실제 vendor 전송은
 * 별도 승인 전까지 도입하지 않는다.
 *
 * 계약: ErrorReport는 아래 6개 필드만 허용한다. review title/body, note/comment,
 * email, access token, DB error 원문의 row data, 전체 사용자 ID는 절대 담기지 않는다 —
 * `assertAllowedErrorReport`가 허용 목록 밖의 필드를 조용히 지우지 않고 예외로 거부한다.
 */

export type ErrorReportRole = 'leader' | 'member' | 'unknown'

export type ErrorReport = {
  fingerprint: string
  buildSha: string
  route: string
  role: ErrorReportRole
  operation: string | null
  occurredAt: string
}

export const ERROR_REPORT_ALLOWED_KEYS = [
  'fingerprint',
  'buildSha',
  'route',
  'role',
  'operation',
  'occurredAt',
] as const satisfies readonly (keyof ErrorReport)[]

const ALLOWED_KEY_SET = new Set<string>(ERROR_REPORT_ALLOWED_KEYS)
const ALLOWED_ROLES: readonly ErrorReportRole[] = ['leader', 'member', 'unknown']

export class ErrorReportRejectedError extends Error {
  constructor() {
    super()
    this.name = 'ErrorReportRejectedError'
  }
}

function rejectErrorReport(): never {
  throw new ErrorReportRejectedError()
}

/**
 * 허용 목록 검증. 정의되지 않은 필드가 하나라도 있으면(호출부가 실수로 raw error나
 * context 객체를 spread해 PII 필드가 섞여 들어온 경우 포함) 거부한다. 침묵 필터링은
 * 실수를 감춰 나중에 더 큰 유출로 이어질 수 있으므로 항상 예외를 던진다.
 */
export function assertAllowedErrorReport(value: unknown): ErrorReport {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    rejectErrorReport()
  }
  if (Object.keys(value).some((key) => !ALLOWED_KEY_SET.has(key))) rejectErrorReport()
  if (ERROR_REPORT_ALLOWED_KEYS.some((key) => !(key in value))) rejectErrorReport()

  const report = value as ErrorReport
  if (typeof report.fingerprint !== 'string' || report.fingerprint.length === 0) {
    rejectErrorReport()
  }
  if (typeof report.buildSha !== 'string' || report.buildSha.length === 0) {
    rejectErrorReport()
  }
  if (typeof report.route !== 'string' || report.route.length === 0) {
    rejectErrorReport()
  }
  if (!ALLOWED_ROLES.includes(report.role)) {
    rejectErrorReport()
  }
  if (report.operation !== null && typeof report.operation !== 'string') {
    rejectErrorReport()
  }
  if (typeof report.occurredAt !== 'string' || Number.isNaN(Date.parse(report.occurredAt))) {
    rejectErrorReport()
  }

  return report
}

export type ErrorReporter = {
  report: (report: ErrorReport) => void
}

/** 승인 전 기본 상태로 되돌리고 싶을 때 쓰는 완전 무동작 adapter. */
export const noopErrorReporter: ErrorReporter = { report: () => {} }

/** 승인된 vendor 전송이 생기기 전까지 쓰는 기본 adapter — 브라우저 콘솔에만 남긴다. */
export function createConsoleErrorReporter(logger: Pick<Console, 'error'> = console): ErrorReporter {
  return {
    report(report) {
      logger.error('[error-report]', assertAllowedErrorReport(report))
    },
  }
}

let activeReporter: ErrorReporter = createConsoleErrorReporter()

export function setErrorReporter(reporter: ErrorReporter): void {
  activeReporter = reporter
}

export function getErrorReporter(): ErrorReporter {
  return activeReporter
}

/** 테스트·재초기화용 — 콘솔 adapter로 복귀한다. */
export function resetErrorReporter(): void {
  activeReporter = createConsoleErrorReporter()
}

let cachedBuildSha = 'unknown'

export function setBuildSha(sha: string): void {
  cachedBuildSha = typeof sha === 'string' && sha.trim().length > 0 ? sha : 'unknown'
}

export function getBuildSha(): string {
  return cachedBuildSha
}

const VERSION_SHA_PATTERN = /^[0-9a-f]{40}$/

/**
 * 배포 산출물의 `/version.json`(`scripts/render-build-provenance.mjs`가 씀)에서 canonical
 * build SHA를 읽어온다. 오프라인·프리뷰 등에서 실패해도 조용히 무시한다 — buildSha는
 * 부가 진단 정보일 뿐 앱 동작을 막지 않는다.
 */
export async function loadBuildShaFromVersionFile(fetchImpl: typeof fetch = fetch): Promise<string> {
  try {
    const response = await fetchImpl('/version.json', { cache: 'no-store' })
    if (!response.ok) return getBuildSha()
    const payload = (await response.json()) as { sha?: unknown }
    if (typeof payload.sha === 'string' && (payload.sha === 'local' || VERSION_SHA_PATTERN.test(payload.sha))) {
      setBuildSha(payload.sha)
    }
  } catch {
    // ignore — see comment above.
  }
  return getBuildSha()
}

/** FNV-1a 32-bit — 암호학적 용도가 아니라 같은 모양의 오류를 그룹화하는 fingerprint용. */
function hashToHex(input: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/** 이메일·UUID·따옴표로 감싼 값 같은 원문 조각이 fingerprint 입력에 그대로 남지 않게 지운다. */
function redact(message: string): string {
  return message
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/gi, '<email>')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '<uuid>')
    .replace(/(['"]).*?\1/g, '<value>')
    .slice(0, 200)
}

/**
 * error message/stack 원문은 report에 절대 담기지 않는다 — 이름 + 정리된 메시지 + 선택적
 * context를 해시한 fingerprint 하나만 남는다. 같은 결함은 같은 fingerprint로 모이지만,
 * DB row data·리뷰 제목 같은 원문은 해시를 지나며 사라진다.
 */
export function computeErrorFingerprint(error: unknown, context?: string): string {
  const name = error instanceof Error ? error.name : 'UnknownError'
  const message = error instanceof Error ? error.message : String(error)
  const parts = [name, redact(message)]
  if (context) parts.push(redact(context))
  return hashToHex(parts.join('|'))
}

export type ErrorReportInput = {
  error: unknown
  route: string
  role: ErrorReportRole
  operation: string | null
  /** fingerprint 그룹화에만 쓰이는 추가 신호(예: componentStack) — 해시되어 사라진다. */
  context?: string
  now?: () => Date
}

export function buildErrorReport({ error, route, role, operation, context, now = () => new Date() }: ErrorReportInput): ErrorReport {
  const canonicalRoute = (route.split('?')[0] || '#/unknown').slice(0, 64)
  return assertAllowedErrorReport({
    fingerprint: computeErrorFingerprint(error, context),
    buildSha: getBuildSha(),
    route: canonicalRoute,
    role,
    operation: operation === null ? null : 'mutation',
    occurredAt: now().toISOString(),
  })
}

/**
 * ErrorBoundary와 mutation runner가 함께 쓰는 단일 진입점. reporter 자체의 실패(구현
 * 버그, 네트워크 adapter 오류 등)가 사용자 작업 흐름을 막으면 안 되므로 항상 흡수한다.
 */
export function reportError(input: ErrorReportInput): void {
  try {
    const report = buildErrorReport(input)
    getErrorReporter().report(report)
  } catch {
    // ignore — see comment above.
  }
}
