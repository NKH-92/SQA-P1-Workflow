import { useState } from 'react'
import { Badge, FormGrid, Rows, Section } from '../components/ui'
import type { AppData } from '../types'
import { formatDate } from '../lib/format'
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
        <span>Workspace / Activity</span>
        <h1>활동 로그</h1>
        <p>팀 전체 활동 이력 {data.activityLogs.length}건</p>
      </div>
      <label className="search-field">
        <Search size={16} />
        <input placeholder="요약, 액션, 유형 검색" value={query} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <Section title="전체 기록" icon={<MessageSquare size={18} />}>
        <div className="activity-list">
          {visibleLogs.length === 0 ? (
            <p className="empty-copy">표시할 활동이 없습니다.</p>
          ) : (
            visibleLogs.map((log) => (
              <article className="activity-row" key={log.id}>
                <div>
                  <strong>{log.summary}</strong>
                  <small>
                    {formatDate(log.created_at)} · {log.action}
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
