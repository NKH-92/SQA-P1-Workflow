import { useState } from 'react'
import { EmptyState, Section, Sparkline } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { formatDate, reviewStatusLabels } from '../lib/format'
import { buildReviewMonthlyStats } from '../lib/stats'
import { dueDateLabel, dueDateStatus, daysUntil } from '../lib/dates'
import { reviewPriorityScore } from '../lib/priority'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import {
  CalendarClock,
  ChevronRight,
  Inbox,
  ListTodo,
  Package,
  Timer,
} from 'lucide-react'

type PriorityUrgency = 'urgent' | 'warning' | 'normal'

type PriorityItem = {
  id: string
  kind: string
  title: string
  who: string
  dueLabel: string
  dueDetail: string
  urgency: PriorityUrgency
  targetTab: TabId
  entityId?: string
  score: number
  group: PriorityGroupKey
}

/** A2: 우선순위 큐를 시급도 순서의 소그룹으로 나눈다. */
type PriorityGroupKey = 'overdue' | 'week' | 'assign' | 'later'

const PRIORITY_GROUPS: Array<{ key: PriorityGroupKey; label: string; urgency: PriorityUrgency }> = [
  { key: 'overdue', label: '지연 · 오늘', urgency: 'urgent' },
  { key: 'week', label: '이번 주', urgency: 'warning' },
  { key: 'assign', label: '배정 필요', urgency: 'normal' },
  { key: 'later', label: '기한 여유 · 없음', urgency: 'normal' },
]

const PRIORITY_PREVIEW_COUNT = 8

export function LeaderDashboard({
  profile,
  data,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const [showAllPriorities, setShowAllPriorities] = useState(false)
  const { teamMembers } = useTeamSummaries(data)
  const pendingReviews = data.reviewRequests.filter((request) => request.status === 'pending')
  const productAssignmentIds = new Set(data.productAssignments.map((assignment) => assignment.product_id))
  const unassignedProducts = data.products.filter((product) => !productAssignmentIds.has(product.id))
  const membersWithAssignmentGaps = teamMembers.filter(
    (member) =>
      !data.productAssignments.some((assignment) => assignment.user_id === member.id) ||
      !data.dutyAssignments.some((assignment) => assignment.user_id === member.id),
  )
  const openReviewRequests = [...pendingReviews].sort(
    (left, right) => reviewPriorityScore(left) - reviewPriorityScore(right),
  )
  // 프로젝트 단위로 센다 — 배정 행 단위로 세면 담당자 수만큼 부풀고, 무배정 프로젝트는 누락된다.
  const projectReminderItems = data.projects
    .map((project) => {
      const days = daysUntil(project.deadline)
      const assigneeNames = data.projectAssignments
        .filter((assignment) => assignment.project_id === project.id)
        .map(
          (assignment) =>
            (assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id))?.name ?? null,
        )
        .filter((name): name is string => Boolean(name))
      return { project, days, assigneeNames }
    })
    .filter(({ project, days }) => project.deadline && project.status !== 'done' && days != null && days <= 14)
    .sort((left, right) => (left.days ?? 999) - (right.days ?? 999))

  const reviewUrgency = (dueDate: string | null | undefined): PriorityUrgency => {
    const status = dueDateStatus(dueDate)
    if (status === 'overdue' || status === 'due_now') return 'urgent'
    if (status === 'due_soon') return 'warning'
    return 'normal'
  }

  const urgencyGroup = (urgency: PriorityUrgency): PriorityGroupKey =>
    urgency === 'urgent' ? 'overdue' : urgency === 'warning' ? 'week' : 'later'

  const priorityQueue: PriorityItem[] = [
    ...openReviewRequests.map((request) => {
      const urgency = reviewUrgency(request.due_date)
      return {
        id: `review-${request.id}`,
        kind: '검토요청',
        title: request.title,
        who: request.profiles?.name ?? '요청자',
        dueLabel: request.due_date ? dueDateLabel(request.due_date) : '기한 없음',
        dueDetail: request.due_date ? formatDate(request.due_date) : reviewStatusLabels[request.status],
        urgency,
        targetTab: 'reviews' as TabId,
        entityId: request.id,
        score: reviewPriorityScore(request),
        group: urgencyGroup(urgency),
      }
    }),
    ...projectReminderItems.map(({ project, days, assigneeNames }) => {
      // 8~14일 뒤 마감은 '이번 주'가 아니다 — normal로 두면 '기한 여유' 그룹으로 내려간다.
      const urgency: PriorityUrgency = days != null && days <= 3 ? 'urgent' : days != null && days <= 7 ? 'warning' : 'normal'
      return {
        id: `project-${project.id}`,
        kind: '프로젝트',
        title: project.name,
        who: assigneeNames.length > 0 ? assigneeNames.join(', ') : '담당자 미지정',
        dueLabel: dueDateLabel(project.deadline),
        dueDetail: formatDate(project.deadline),
        urgency,
        targetTab: 'projects' as TabId,
        score: 3000 + (days ?? 999),
        group: urgencyGroup(urgency),
      }
    }),
    ...(unassignedProducts.length > 0
      ? [
          {
            id: 'unassigned-products',
            kind: '마스터',
            title: '미배정 제품 확인',
            who: `${unassignedProducts.length}개 제품`,
            dueLabel: '배정 필요',
            dueDetail: '담당자를 지정해야 합니다',
            urgency: 'normal' as PriorityUrgency,
            targetTab: 'products' as TabId,
            score: 5000,
            group: 'assign' as PriorityGroupKey,
          },
        ]
      : []),
    ...(membersWithAssignmentGaps.length > 0
      ? [
          {
            id: 'assignment-gaps',
            kind: '파트원',
            title: '담당 공백 파트원 확인',
            who: `${membersWithAssignmentGaps.length}명`,
            dueLabel: '배정 필요',
            dueDetail: '제품 또는 업무 배정이 비어 있습니다',
            urgency: 'normal' as PriorityUrgency,
            targetTab: 'team' as TabId,
            score: 5100,
            group: 'assign' as PriorityGroupKey,
          },
        ]
      : []),
  ].sort((left, right) => left.score - right.score)

  const visibleQueue = showAllPriorities ? priorityQueue : priorityQueue.slice(0, PRIORITY_PREVIEW_COUNT)
  const hiddenPriorityCount = priorityQueue.length - visibleQueue.length
  const priorityGroups = PRIORITY_GROUPS.map((group) => ({
    ...group,
    items: visibleQueue.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0)

  const monthlyStats = buildReviewMonthlyStats(data.reviewRequests)
  const currentMonthStats = monthlyStats[monthlyStats.length - 1]
  const dueSoonProjectCount = projectReminderItems.filter(({ days }) => days != null && days <= 7).length
  const todayLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>안녕하세요, {profile.name}님.</h1>
        <p>
          {todayLabel} · 먼저 확인할 항목 <strong>{priorityQueue.length}건</strong>
        </p>
      </div>

      {/* A1: 핵심 지표를 최상단에서 한눈에. 클릭하면 해당 화면으로 이동한다. */}
      <div className="kpi-strip">
        <button className="kpi-stat" onClick={() => setActiveTab('reviews')} type="button">
          <span className="kpi-stat-label">
            대기 검토
            <Inbox size={15} aria-hidden="true" />
          </span>
          <strong className="kpi-stat-value">
            {pendingReviews.length}
            <span className="unit">건</span>
          </strong>
        </button>
        <button
          className="kpi-stat"
          data-tone={dueSoonProjectCount > 0 ? 'warning' : undefined}
          onClick={() => setActiveTab('projects')}
          type="button"
        >
          <span className="kpi-stat-label">
            마감 임박 프로젝트
            <CalendarClock size={15} aria-hidden="true" />
          </span>
          <strong className="kpi-stat-value">
            {dueSoonProjectCount}
            <span className="unit">건</span>
          </strong>
        </button>
        <button
          className="kpi-stat"
          data-tone={unassignedProducts.length > 0 ? 'warning' : undefined}
          onClick={() => setActiveTab('products')}
          type="button"
        >
          <span className="kpi-stat-label">
            미배정 제품
            <Package size={15} aria-hidden="true" />
          </span>
          <strong className="kpi-stat-value">
            {unassignedProducts.length}
            <span className="unit">개</span>
          </strong>
        </button>
        <div className="kpi-stat">
          <span className="kpi-stat-label">
            이번 달 평균 처리일
            <Timer size={15} aria-hidden="true" />
          </span>
          <strong className="kpi-stat-value">
            {currentMonthStats?.avgProcessingDays != null ? currentMonthStats.avgProcessingDays : '-'}
            {currentMonthStats?.avgProcessingDays != null && <span className="unit">일</span>}
          </strong>
        </div>
      </div>

      <Section title="먼저 확인할 것" icon={<ListTodo size={18} />} aside={`총 ${priorityQueue.length}건`}>
        <div className="priority-list">
          {priorityGroups.length === 0 && (
            <EmptyState
              icon={<ListTodo size={22} />}
              title="오늘 먼저 처리할 항목이 없습니다."
              description="새 검토요청이 오면 이 자리에 시급한 순서로 정렬됩니다."
            />
          )}
          {priorityGroups.map((group) => (
            <div className="priority-group" data-urgency={group.urgency} key={group.key}>
              <div className="priority-group-label">
                {group.label}
                <small>{group.items.length}건</small>
              </div>
              {group.items.map((item) => (
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
                    <small>
                      {item.who}
                      <span className="dot-sep" aria-hidden="true" />
                      {item.dueDetail}
                    </small>
                  </span>
                  <span className="priority-due">{item.dueLabel}</span>
                  <span className="priority-arrow" aria-hidden="true">
                    <ChevronRight size={16} />
                  </span>
                </button>
              ))}
            </div>
          ))}
          {hiddenPriorityCount > 0 && (
            <button className="activity-more" onClick={() => setShowAllPriorities(true)} type="button">
              나머지 {hiddenPriorityCount}건 모두 보기 →
            </button>
          )}
          {showAllPriorities && priorityQueue.length > PRIORITY_PREVIEW_COUNT && (
            <button className="activity-more" onClick={() => setShowAllPriorities(false)} type="button">
              상위 {PRIORITY_PREVIEW_COUNT}건만 보기
            </button>
          )}
        </div>
      </Section>

      <Section title="월간 검토 처리" icon={<CalendarClock size={18} />} aside={currentMonthStats?.month}>
        <div>
          <div className="stats-kpi-grid">
            <article className="kpi">
              <div className="kpi-label">이번 달 접수</div>
              <div className="kpi-value">
                {currentMonthStats?.submitted ?? 0}
                <span className="unit">건</span>
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-label">완료</div>
              <div className="kpi-value">
                {currentMonthStats?.approved ?? 0}
                <span className="unit">건</span>
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-label">반려</div>
              <div className="kpi-value">
                {currentMonthStats?.rejected ?? 0}
                <span className="unit">건</span>
              </div>
            </article>
            <article className="kpi">
              <div className="kpi-label">평균 처리일</div>
              <div className="kpi-value">
                {currentMonthStats?.avgProcessingDays != null ? currentMonthStats.avgProcessingDays : '-'}
                {currentMonthStats?.avgProcessingDays != null && <span className="unit">일</span>}
              </div>
            </article>
          </div>

          <div className="sparkline-container">
            <div className="sparkline-head">
              <strong>최근 {monthlyStats.length}개월 추이</strong>
              <div className="sparkline-legend">
                <span>
                  <i className="swatch" aria-hidden="true" />
                  접수
                </span>
                <span>
                  <i className="swatch done" aria-hidden="true" />
                  완료
                </span>
              </div>
            </div>
            <Sparkline
              submitted={monthlyStats.map((row) => row.submitted)}
              approved={monthlyStats.map((row) => row.approved)}
            />
          </div>

          <div className="month-history" style={{ marginTop: 18 }}>
            <div className="month-history-row head">
              <span>월</span>
              <span>접수</span>
              <span>완료</span>
              <span>반려</span>
              <span>평균</span>
            </div>
            {monthlyStats.map((row) => (
              <div
                className={row.month === currentMonthStats?.month ? 'month-history-row current' : 'month-history-row'}
                key={row.month}
              >
                <span className="m">{row.month}</span>
                <span>{row.submitted}</span>
                <span>{row.approved}</span>
                <span>{row.rejected}</span>
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
          <span className="warm-callout-arrow">배정하기 →</span>
        </button>
      )}
    </div>
  )
}
