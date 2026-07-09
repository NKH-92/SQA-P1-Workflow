import { useState } from 'react'
import { Badge, Section } from '../components/ui'
import type { AppData } from '../types'
import { formatDate } from '../lib/format'
import { relativeDateLabel } from '../lib/dates'
import { MessageSquare, Search } from 'lucide-react'

export function ActivityPanel({ data }: { data: AppData }) {
  const [query, setQuery] = useState('')
  const normalizedQuery = query.trim().toLowerCase()
  const visibleLogs = data.activityLogs.filter((log) => {
    if (!normalizedQuery) return true
    const haystack = [log.summary, log.action, log.entity_type, log.entity_id, log.actor_id].filter(Boolean).join(' ').toLowerCase()
    return haystack.includes(normalizedQuery)
  })

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>활동 로그</h1>
        <p>팀 활동 이력 최근 {data.activityLogs.length}건 (최대 100건)</p>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input placeholder="요약, 액션, 유형 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <Section title="최근 100건" icon={<MessageSquare size={18} />}>
        <p className="empty-copy">더 오래된 기록은 Supabase Dashboard 또는 백업에서 확인하세요.</p>
        <div className="activity-list">
          {visibleLogs.length === 0 ? (
            <p className="empty-copy">표시할 활동이 없습니다.</p>
          ) : (
            visibleLogs.map((log) => (
              <article className="activity-row" key={log.id}>
                <div>
                  <strong>{log.summary}</strong>
                  <small title={formatDate(log.created_at)}>
                    {relativeDateLabel(log.created_at)} · {log.action}
                  </small>
                </div>
                <Badge status="pending">{log.entity_type}</Badge>
              </article>
            ))
          )}
        </div>
      </Section>
    </div>
  )
}
