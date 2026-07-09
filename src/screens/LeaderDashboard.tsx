import { useState } from 'react'
import { EmptyState, Section, Sparkline } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { buildReviewMonthlyStats } from '../lib/stats'
import {
  PRIORITY_GROUPS,
  selectLeaderPriorityQueue,
  selectProjectReminderItems,
  selectUnassignedProducts,
} from '../features/dashboard/prioritySelectors'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import {
  CalendarClock,
  ChevronRight,
  Inbox,
  ListTodo,
  Package,
  Timer,
} from 'lucide-react'

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
  const unassignedProducts = selectUnassignedProducts(data)
  const projectReminderItems = selectProjectReminderItems(data)
  const priorityQueue = selectLeaderPriorityQueue(data, teamMembers)

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

      {/* 핵심 지표를 최상단에서 한눈에. 클릭하면 해당 화면으로 이동한다. */}
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
