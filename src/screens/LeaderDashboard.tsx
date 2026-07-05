import { Badge, Section } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { formatDate, reviewStatusLabels } from '../lib/format'
import { buildReviewMonthlyStats } from '../lib/stats'
import { dueDateLabel, dueDateStatus, daysUntil } from '../lib/dates'
import { reviewPriorityScore } from '../lib/priority'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import {
  CalendarClock,
  MessageSquare,
  Package,
  Users,
} from 'lucide-react'

type PriorityUrgency = 'urgent' | 'warning' | 'normal'

export function LeaderDashboard({
  profile,
  data,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const { teamMembers, workloadSummaries } = useTeamSummaries(data)
  const pendingReviews = data.reviewRequests.filter((request) => request.status === 'pending')
  const productAssignmentIds = new Set(data.productAssignments.map((assignment) => assignment.product_id))
  const unassignedProducts = data.products.filter((product) => !productAssignmentIds.has(product.id))
  const membersWithAssignmentGaps = teamMembers.filter(
    (member) =>
      !data.productAssignments.some((assignment) => assignment.user_id === member.id) ||
      !data.dutyAssignments.some((assignment) => assignment.user_id === member.id),
  )
  const openReviewRequests = data.reviewRequests
    .filter((request) => request.status === 'pending')
    .sort((left, right) => reviewPriorityScore(left) - reviewPriorityScore(right))
  const projectReminderItems = data.projectAssignments
    .map((assignment) => {
      const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
      const member = assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id)
      const days = daysUntil(project?.deadline)
      return { assignment, project, member, days }
    })
    .filter(({ project, days }) => project?.deadline && project.status !== 'done' && days != null && days <= 14)
    .sort((left, right) => (left.days ?? 999) - (right.days ?? 999))
  const reviewUrgency = (dueDate: string | null | undefined): PriorityUrgency => {
    const status = dueDateStatus(dueDate)
    if (status === 'overdue' || status === 'due_now') return 'urgent'
    if (status === 'due_soon') return 'warning'
    return 'normal'
  }
  const priorityQueue: Array<{
    id: string
    kind: string
    title: string
    meta: string
    due: string
    status: string
    urgency: PriorityUrgency
    who?: string
    targetTab: TabId
    entityId?: string
    score: number
  }> = [
    ...openReviewRequests.map((request) => ({
      id: `review-${request.id}`,
      kind: '검토요청',
      title: request.title,
      meta: `${request.profiles?.name ?? '요청자'} · ${reviewStatusLabels[request.status]}`,
      due: request.due_date ? `${dueDateLabel(request.due_date)} · ${formatDate(request.due_date)}` : '기한 없음',
      status: dueDateStatus(request.due_date),
      urgency: reviewUrgency(request.due_date),
      who: request.profiles?.name,
      targetTab: 'reviews' as TabId,
      entityId: request.id,
      score: reviewPriorityScore(request),
    })),
    ...projectReminderItems.map(({ assignment, project, member, days }) => ({
      id: `project-${assignment.id}`,
      kind: '프로젝트',
      title: project?.name ?? assignment.project_id,
      meta: `${member?.name ?? assignment.user_id} · 마감 확인`,
      due: project?.deadline ? `${dueDateLabel(project.deadline)} · ${formatDate(project.deadline)}` : '마감 없음',
      status: days != null && days < 0 ? 'overdue' : 'due_soon',
      urgency: (days != null && days <= 3 ? 'urgent' : 'warning') as PriorityUrgency,
      who: member?.name,
      targetTab: 'projects' as TabId,
      score: 3000 + (days ?? 999),
    })),
    ...(unassignedProducts.length > 0
      ? [
          {
            id: 'unassigned-products',
            kind: '마스터',
            title: '미배정 제품 확인',
            meta: `${unassignedProducts.length}개 제품`,
            due: '담당자를 지정해야 합니다',
            status: 'scheduled',
            urgency: 'normal' as PriorityUrgency,
            targetTab: 'products' as TabId,
            score: 5000,
          },
        ]
      : []),
    ...(membersWithAssignmentGaps.length > 0
      ? [
          {
            id: 'assignment-gaps',
            kind: '파트원',
            title: '담당 공백 파트원 확인',
            meta: `${membersWithAssignmentGaps.length}명`,
            due: '제품 또는 업무 배정이 비어 있습니다',
            status: 'scheduled',
            urgency: 'normal' as PriorityUrgency,
            targetTab: 'team' as TabId,
            score: 5100,
          },
        ]
      : []),
  ].sort((left, right) => left.score - right.score)
  const visibleActivityLogs = data.activityLogs.slice(0, 6)
  const actorName = (actorId: string) => data.profiles.find((item) => item.id === actorId)?.name ?? null
  const monthlyStats = buildReviewMonthlyStats(data.reviewRequests)
  const currentMonthStats = monthlyStats[monthlyStats.length - 1]
  const todayLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  return (
    <div className="stack">
      <div className="page-intro">
        <span>{todayLabel}</span>
        <h1>안녕하세요, {profile.name}님.</h1>
        <p>
          오늘 먼저 확인해야 할 항목이 <strong>{priorityQueue.length}건</strong> 있어요.
        </p>
      </div>

      <section className="v2-hero-card">
        <header>
          <div>
            <span>Priority</span>
            <h2>먼저 확인할 것들</h2>
            <p>검토 대기, 마감 임박, 담당 공백 순으로 정렬했습니다.</p>
          </div>
          <Badge status={pendingReviews.length > 0 ? 'pending' : 'scheduled'}>대기 {pendingReviews.length}건</Badge>
        </header>
        <div className="priority-row-list">
          {priorityQueue.length === 0 && <p className="empty">오늘 먼저 처리할 항목이 없습니다.</p>}
          {priorityQueue.slice(0, 8).map((item) => (
            <button
              className="priority-row"
              data-urgency={item.urgency}
              key={item.id}
              onClick={() => setActiveTab(item.targetTab, item.entityId)}
              type="button"
            >
              <span className="priority-kind">{item.kind}</span>
              <span className="priority-copy">
                <strong>{item.title}</strong>
                <small>{item.meta}</small>
              </span>
              <Badge status={item.status}>{item.due}</Badge>
            </button>
          ))}
        </div>
      </section>

      <div className="grid two">
        <Section title="팀 워크로드" icon={<Users size={18} />} aside={`${teamMembers.length}명`} flush>
          <div className="workload-list">
            {workloadSummaries.map((summary) => (
              <button className="workload-row" key={summary.member.id} onClick={() => setActiveTab('team')} type="button">
                <span>
                  <strong>{summary.member.name}</strong>
                  <small>
                    제품 {summary.products.length} · 업무 {summary.duties.length} · 프로젝트 {summary.projects.length}
                  </small>
                </span>
                <span className="load-count" data-tone={summary.tone}>
                  <strong>{summary.load}</strong>
                  <small>{summary.label}</small>
                </span>
              </button>
            ))}
          </div>
        </Section>
        <Section title="최근 활동" icon={<MessageSquare size={18} />} aside="최근 6건" flush>
          <div className="activity-feed">
            {visibleActivityLogs.length === 0 && <p className="empty">아직 기록된 활동이 없습니다.</p>}
            {visibleActivityLogs.map((log) => {
              const name = actorName(log.actor_id)
              return (
                <div className="activity-feed-row" key={log.id}>
                  <div>
                    <p>{log.summary}</p>
                    <small>
                      {formatDate(log.created_at)} · {log.action}
                    </small>
                  </div>
                </div>
              )
            })}
            <button className="activity-more" onClick={() => setActiveTab('activity')} type="button">
              전체 활동 보기 →
            </button>
          </div>
        </Section>
      </div>

      <Section title="월간 검토 처리" icon={<CalendarClock size={18} />} aside={currentMonthStats?.month}>
        <div>
          <div className="stats-grid">
            <article className="stat-card">
              <span>이번 달 접수</span>
              <strong>{currentMonthStats?.submitted ?? 0}건</strong>
            </article>
            <article className="stat-card">
              <span>완료</span>
              <strong>{currentMonthStats?.approved ?? 0}건</strong>
            </article>
            <article className="stat-card">
              <span>반려</span>
              <strong>{currentMonthStats?.rejected ?? 0}건</strong>
            </article>
            <article className="stat-card">
              <span>평균 처리일</span>
              <strong>{currentMonthStats?.avgProcessingDays != null ? `${currentMonthStats.avgProcessingDays}일` : '-'}</strong>
            </article>
          </div>
          <div className="stats-table">
            {monthlyStats.map((row) => (
              <div className="stats-row" key={row.month}>
                <span>{row.month}</span>
                <span>접수 {row.submitted}</span>
                <span>완료 {row.approved}</span>
                <span>반려 {row.rejected}</span>
                <span>{row.avgProcessingDays != null ? `${row.avgProcessingDays}일` : '-'}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {unassignedProducts.length > 0 && (
        <button className="warm-callout" onClick={() => setActiveTab('products')} type="button">
          <Package size={18} />
          <span>
            <strong>담당자가 없는 제품 {unassignedProducts.length}개</strong>
            <small>{unassignedProducts.slice(0, 4).map((product) => product.name).join(', ')}</small>
          </span>
          <Badge status="pending">배정하기 →</Badge>
        </button>
      )}
    </div>
  )
}
