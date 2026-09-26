import { useEffect, useMemo, useRef } from 'react'
import { FileClock, MessageSquare, RefreshCw, Search } from 'lucide-react'
import { Badge, EmptyState, Section } from '../components/ui'
import type { AppData, AuditEvent } from '../types'
import { formatDateTime } from '../lib/format'
import { relativeDateLabel } from '../lib/dates'
import {
  auditValueText,
  isLegacyAuditLifecycle,
  safeAuditDelta,
  safeAuditFields,
} from '../features/activity/auditModel'
import {
  activityActionLabel,
  activityEntityLabel,
  auditFieldLabel,
  auditSourceLabel,
  toHaeyoSummary,
} from '../features/activity/activityPresentation'
import { useAuditFeed } from '../features/activity/useAuditFeed'
import { useViewState } from '../hooks/useViewState'

type HistoryMode = 'activity' | 'audit'

const isString = (value: unknown): value is string => typeof value === 'string'
const isHistoryMode = (value: unknown): value is HistoryMode => value === 'activity' || value === 'audit'

function AuditEventDetails({ event }: { event: AuditEvent }) {
  const fields = safeAuditFields(event)
  const before = safeAuditDelta(event.before_delta)
  const after = safeAuditDelta(event.after_delta)
  const isLegacyLifecycle = isLegacyAuditLifecycle(event)

  if (isLegacyLifecycle) {
    return <p className="audit-legacy-note">이전 방식으로 남은 기록이라 자세한 내용이 없어요</p>
  }

  return (
    <details className="audit-event-details">
      <summary>{event.action === 'updated' ? '바뀐 항목 보기' : '저장된 값 보기'}</summary>
      <div className="audit-field-list">
        {fields.map((field) => (
          <div className="audit-field" key={field}>
            <strong>{auditFieldLabel(field)}</strong>
            {event.action !== 'inserted' && (
              <div>
                <span>{event.action === 'updated' ? '이전' : '삭제 전'}</span>
                <pre>{auditValueText(before[field])}</pre>
              </div>
            )}
            {event.action !== 'deleted' && (
              <div>
                <span>{event.action === 'updated' ? '이후' : '만들 때 값'}</span>
                <pre>{auditValueText(after[field])}</pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </details>
  )
}

export function ActivityPanel({ data }: { data: AppData }) {
  const [query, setQuery] = useViewState('activity.leader.query', '', isString)
  const [mode, setMode] = useViewState<HistoryMode>('activity.leader.mode', 'activity', isHistoryMode)
  const { events: auditEvents, loading: auditLoading, error: auditError, load: loadAudit } = useAuditFeed(data.auditEvents ?? [])
  const auditRequestedRef = useRef(false)

  // 변경 기록 탭을 보던 채로 돌아오면(보기 상태 복원) 기록을 한 번 불러온다.
  useEffect(() => {
    if (mode !== 'audit' || auditRequestedRef.current) return
    auditRequestedRef.current = true
    if (auditEvents.length === 0 && !auditLoading) void loadAudit(false)
  }, [auditEvents.length, auditLoading, loadAudit, mode])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleLogs = useMemo(() => data.activityLogs.filter((log) => {
    if (!normalizedQuery) return true
    return [
      log.summary,
      toHaeyoSummary(log.summary),
      activityActionLabel(log.action),
      activityEntityLabel(log.entity_type),
      log.entity_id,
    ]
      .filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
  }), [data.activityLogs, normalizedQuery])
  const visibleAudit = useMemo(() => auditEvents.filter((event) => {
    if (!normalizedQuery) return true
    const searchableBefore = JSON.stringify(safeAuditDelta(event.before_delta))
    const searchableAfter = JSON.stringify(safeAuditDelta(event.after_delta))
    return [
      event.actor_name,
      activityEntityLabel(event.entity_type),
      activityActionLabel(event.action),
      auditSourceLabel(event.source),
      event.entity_id,
      event.reason,
      ...safeAuditFields(event).map(auditFieldLabel),
      searchableBefore,
      searchableAfter,
    ]
      .filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
  }), [auditEvents, normalizedQuery])

  const searchEmptyState = (
    <EmptyState
      icon={<Search size={22} />}
      title="검색 결과가 없어요"
      description="사람 이름, 사유, 항목 이름으로 다시 찾아보세요."
      action={
        <button className="ghost compact" onClick={() => setQuery('')} type="button">
          검색어 지우기
        </button>
      }
    />
  )

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>활동 로그</h1>
        <p>팀에서 한 일과, 누가 어떤 값을 바꿨는지 남긴 변경 기록을 나눠서 볼 수 있어요.</p>
      </div>
      <div className="workspace-view-toggle" role="group" aria-label="기록 종류">
        <button aria-pressed={mode === 'activity'} className={mode === 'activity' ? 'selected' : ''} onClick={() => setMode('activity')} type="button">최근 활동</button>
        <button
          aria-pressed={mode === 'audit'}
          className={mode === 'audit' ? 'selected' : ''}
          onClick={() => {
            setMode('audit')
            auditRequestedRef.current = true
            if (auditEvents.length === 0 && !auditLoading) void loadAudit(false)
          }}
          type="button"
        >변경 기록</button>
      </div>
      <label className="search-field">
        <Search aria-hidden="true" size={16} />
        <input aria-label="활동 로그 검색" placeholder="사람, 사유, 항목 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {mode === 'activity' ? (
        <Section title={`최근 활동 ${data.activityLogs.length}건`} icon={<MessageSquare size={18} />}>
          <p className="empty-copy" role="note">
            최근 100건까지 보여요. 더 오래된 기록이 필요하면 관리자에게 요청해 주세요.
            누가 어떤 값을 바꿨는지는 ‘변경 기록’에서 볼 수 있어요.
          </p>
          <div className="activity-list">
            {visibleLogs.length === 0 ? (
              normalizedQuery ? searchEmptyState : (
                <EmptyState
                  icon={<MessageSquare size={22} />}
                  title="아직 활동 기록이 없어요"
                  description="검토요청·공통변경·프로젝트에서 일이 생기면 여기에 차례로 쌓여요."
                />
              )
            ) : visibleLogs.map((log) => (
              <article className="activity-row" key={log.id}>
                <div>
                  <strong>{toHaeyoSummary(log.summary)}</strong>
                  <small>
                    <time dateTime={log.created_at} title={formatDateTime(log.created_at)}>{relativeDateLabel(log.created_at)}</time>
                    {' · '}
                    {activityActionLabel(log.action)}
                  </small>
                </div>
                <Badge>{activityEntityLabel(log.entity_type)}</Badge>
              </article>
            ))}
          </div>
        </Section>
      ) : (
        <Section title="변경 기록" icon={<FileClock size={18} />}>
          <p className="empty-copy" role="note">정해 둔 업무 항목만 만든 값, 지운 값, 바뀌기 전후 값을 남겨요.</p>
          {auditError && (
            <div className="notice error activity-audit-error" role="alert">
              <p>
                <strong>변경 기록을 불러오지 못했어요.</strong> {auditError}
              </p>
              <button className="ghost compact" disabled={auditLoading} onClick={() => void loadAudit(false)} type="button">
                <RefreshCw aria-hidden="true" size={14} />
                다시 시도
              </button>
            </div>
          )}
          <div className="activity-list">
            {visibleAudit.map((event) => {
              const fieldLabels = safeAuditFields(event).map(auditFieldLabel)
              return (
                <article className="activity-row" key={event.id}>
                  <div>
                    <strong>{event.actor_name ?? '시스템'} · {activityEntityLabel(event.entity_type)} {activityActionLabel(event.action)}</strong>
                    <small>
                      <time dateTime={event.changed_at} title={formatDateTime(event.changed_at)}>{relativeDateLabel(event.changed_at)}</time>
                      {' · '}
                      {fieldLabels.join(', ') || '식별자'}
                      {' · '}
                      {event.reason ? `사유: ${event.reason}` : '사유 없음'}
                    </small>
                    <AuditEventDetails event={event} />
                  </div>
                  <Badge>{auditSourceLabel(event.source)}</Badge>
                </article>
              )
            })}
            {!auditLoading && visibleAudit.length === 0 && !auditError && (
              normalizedQuery && auditEvents.length > 0 ? searchEmptyState : (
                <EmptyState
                  icon={<FileClock size={22} />}
                  title="아직 변경 기록이 없어요"
                  description="업무 항목을 만들거나 고치면 여기에 남아요."
                />
              )
            )}
          </div>
          <button className="ghost" disabled={auditLoading} onClick={() => void loadAudit(auditEvents.length > 0)} type="button">
            {auditLoading ? '불러오는 중…' : auditEvents.length > 0 ? '이전 기록 더 보기' : '다시 불러오기'}
          </button>
        </Section>
      )}
    </div>
  )
}
