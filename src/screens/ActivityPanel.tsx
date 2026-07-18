import { useMemo, useState } from 'react'
import { FileClock, MessageSquare, Search } from 'lucide-react'
import { Badge, Section } from '../components/ui'
import { fetchAuditEvents } from '../data'
import type { AppData, AuditEvent } from '../types'
import { formatDate } from '../lib/format'
import { relativeDateLabel } from '../lib/dates'
import { toUserMessage } from '../lib/errors'

export function ActivityPanel({ data }: { data: AppData }) {
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<'activity' | 'audit'>('activity')
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>(data.auditEvents ?? [])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditError, setAuditError] = useState<string | null>(null)

  const loadAudit = async (append: boolean) => {
    setAuditLoading(true)
    setAuditError(null)
    try {
      const beforeId = append && auditEvents.length > 0 ? auditEvents[auditEvents.length - 1].id : null
      const next = await fetchAuditEvents(beforeId)
      setAuditEvents((current) => (append ? [...current, ...next] : next))
    } catch (error) {
      setAuditError(toUserMessage(error))
    } finally {
      setAuditLoading(false)
    }
  }

  const normalizedQuery = query.trim().toLowerCase()
  const visibleLogs = useMemo(() => data.activityLogs.filter((log) => {
    if (!normalizedQuery) return true
    return [log.summary, log.action, log.entity_type, log.entity_id, log.actor_id]
      .filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
  }), [data.activityLogs, normalizedQuery])
  const visibleAudit = useMemo(() => auditEvents.filter((event) => {
    if (!normalizedQuery) return true
    return [event.actor_name, event.entity_type, event.entity_id, event.action, event.reason, ...event.changed_fields]
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
          <p className="empty-copy" role="note">민감한 전체 행 대신 변경된 필드와 전후 값, 사유, 호출 출처만 저장합니다.</p>
          {auditError && <p className="notice">감사 이력을 불러오지 못했습니다. {auditError}</p>}
          <div className="activity-list">
            {visibleAudit.map((event) => (
              <article className="activity-row" key={event.id}>
                <div>
                  <strong>{event.actor_name ?? '시스템'} · {event.entity_type} {event.action}</strong>
                  <small>{relativeDateLabel(event.changed_at)} · {event.changed_fields.join(', ') || '식별자'} · {event.reason ?? '사유 미기록'}</small>
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
