import { useMemo, useState } from 'react'
import { FileClock, MessageSquare, Search } from 'lucide-react'
import { Badge, Section } from '../components/ui'
import type { AppData, AuditEvent } from '../types'
import { formatDate } from '../lib/format'
import { relativeDateLabel } from '../lib/dates'
import {
  auditValueText,
  isLegacyAuditLifecycle,
  safeAuditDelta,
  safeAuditFields,
} from '../features/activity/auditModel'
import { useAuditFeed } from '../features/activity/useAuditFeed'

function AuditEventDetails({ event }: { event: AuditEvent }) {
  const fields = safeAuditFields(event)
  const before = safeAuditDelta(event.before_delta)
  const after = safeAuditDelta(event.after_delta)
  const isLegacyLifecycle = isLegacyAuditLifecycle(event)

  if (isLegacyLifecycle) {
    return <p className="audit-legacy-note">이전 감사 형식 — 상세 snapshot 없음</p>
  }

  return (
    <details className="audit-event-details">
      <summary>{event.action === 'updated' ? '필드별 변경 보기' : '업무 snapshot 보기'}</summary>
      <div className="audit-field-list">
        {fields.map((field) => (
          <div className="audit-field" key={field}>
            <strong>{field}</strong>
            {event.action !== 'inserted' && (
              <div>
                <span>{event.action === 'updated' ? '이전' : '삭제 전'}</span>
                <pre>{auditValueText(before[field])}</pre>
              </div>
            )}
            {event.action !== 'deleted' && (
              <div>
                <span>{event.action === 'updated' ? '이후' : '생성 값'}</span>
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
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'activity' | 'audit'>('activity')
  const { events: auditEvents, loading: auditLoading, error: auditError, load: loadAudit } = useAuditFeed(data.auditEvents ?? [])

  const normalizedQuery = query.trim().toLowerCase()
  const visibleLogs = useMemo(() => data.activityLogs.filter((log) => {
    if (!normalizedQuery) return true
    return [log.summary, log.action, log.entity_type, log.entity_id, log.actor_id]
      .filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
  }), [data.activityLogs, normalizedQuery])
  const visibleAudit = useMemo(() => auditEvents.filter((event) => {
    if (!normalizedQuery) return true
    const searchableBefore = JSON.stringify(safeAuditDelta(event.before_delta))
    const searchableAfter = JSON.stringify(safeAuditDelta(event.after_delta))
    return [
      event.actor_name,
      event.entity_type,
      event.entity_id,
      event.action,
      event.reason,
      ...safeAuditFields(event),
      searchableBefore,
      searchableAfter,
    ]
      .filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
  }), [auditEvents, normalizedQuery])

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>활동 및 감사 이력</h1>
        <p>사용자 안내용 활동과 변경 필드 중심의 보안 감사 원본을 구분해 확인합니다.</p>
      </div>
      <div className="workspace-view-toggle" role="group" aria-label="이력 종류">
        <button className={mode === 'activity' ? 'selected' : ''} onClick={() => setMode('activity')} type="button">활동 로그</button>
        <button
          className={mode === 'audit' ? 'selected' : ''}
          onClick={() => {
            setMode('audit')
            if (auditEvents.length === 0 && !auditLoading) void loadAudit(false)
          }}
          type="button"
        >감사 이력</button>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input placeholder="행위자, 사유, 유형, 변경 필드 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      {mode === 'activity' ? (
        <Section title={`최근 활동 ${data.activityLogs.length}건`} icon={<MessageSquare size={18} />}>
          <p className="empty-copy" role="note">사용자 안내용 기록이며, 권한·감사 증거의 원본은 감사 이력 탭입니다.</p>
          <div className="activity-list">
            {visibleLogs.length === 0 ? <p className="empty-copy">표시할 활동이 없습니다.</p> : visibleLogs.map((log) => (
              <article className="activity-row" key={log.id}>
                <div><strong>{log.summary}</strong><small title={formatDate(log.created_at)}>{relativeDateLabel(log.created_at)} · {log.action}</small></div>
                <Badge status="pending">{log.entity_type}</Badge>
              </article>
            ))}
          </div>
        </Section>
      ) : (
        <Section title="변경 필드 감사 이력" icon={<FileClock size={18} />}>
          <p className="empty-copy" role="note">명시적으로 허용된 업무 필드의 생성·삭제 snapshot과 수정 전후 값만 저장합니다.</p>
          {auditError && <p className="notice">감사 이력을 불러오지 못했습니다. {auditError}</p>}
          <div className="activity-list">
            {visibleAudit.map((event) => (
              <article className="activity-row" key={event.id}>
                <div>
                  <strong>{event.actor_name ?? '시스템'} · {event.entity_type} {event.action}</strong>
                  <small>{relativeDateLabel(event.changed_at)} · {safeAuditFields(event).join(', ') || '식별자'} · {event.reason ?? '사유 미기록'}</small>
                  <AuditEventDetails event={event} />
                </div>
                <Badge status="pending">{event.source}</Badge>
              </article>
            ))}
            {!auditLoading && visibleAudit.length === 0 && !auditError && <p className="empty-copy">표시할 감사 이력이 없습니다.</p>}
          </div>
          <button className="ghost" disabled={auditLoading} onClick={() => void loadAudit(auditEvents.length > 0)} type="button">
            {auditLoading ? '불러오는 중...' : auditEvents.length > 0 ? '이전 기록 더 보기' : '다시 불러오기'}
          </button>
        </Section>
      )}
    </div>
  )
}
