import { useState, type CSSProperties } from 'react'
import { EmptyState, Section, Sparkline } from '../components/ui'
import { DashboardMetricStrip } from '../components/ui/DashboardMetricStrip'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { daysUntil, dueDateLabel } from '../lib/dates'
import { formatDate, projectStatusLabels } from '../lib/format'
import {
  PRIORITY_GROUPS,
  selectLeaderPriorityQueue,
  selectProjectReminderItems,
  selectUnassignedProducts,
} from '../features/dashboard/prioritySelectors'
import {
  buildReviewResolutionSummary,
  buildTeamAllocations,
  selectActiveProjects,
} from '../features/dashboard/dashboardModels'
import { useLeaderReviewOverview } from '../features/dashboard/useLeaderReviewOverview'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import {
  selectChangeApplicationSummary,
  selectProductChangeTaskContexts,
} from '../features/change-applications/selectors'
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardPenLine,
  FolderKanban,
  Inbox,
  ListTodo,
  Package,
  Users,
} from 'lucide-react'

const PRIORITY_PREVIEW_COUNT = 8
const PROJECT_PREVIEW_COUNT = 5

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
  const activeProjects = selectActiveProjects(data)
  const teamAllocations = buildTeamAllocations(data, teamMembers)
  const reviewOverview = useLeaderReviewOverview(data)
  const pendingChangeContexts = selectProductChangeTaskContexts(data).filter(
    ({ task, application }) => application.status === 'published'
      && !application.final_completed_at
      && !application.archived_at
      && task.status === 'pending',
  )
  const riskyChangeCount = pendingChangeContexts.filter(
    ({ task, actionItem }) => !task.assignee_id || (daysUntil(actionItem.due_date) ?? 0) < 0,
  ).length
  const finalReviewApplications = data.changeApplications.filter(
    (application) => selectChangeApplicationSummary(data, application.id)?.workflow_status === 'final_review_ready',
  )

  const visibleQueue = showAllPriorities ? priorityQueue : priorityQueue.slice(0, PRIORITY_PREVIEW_COUNT)
  const hiddenPriorityCount = priorityQueue.length - visibleQueue.length
  const priorityGroups = PRIORITY_GROUPS.map((group) => ({
    ...group,
    items: visibleQueue.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0)

  const reviewEnvelope = reviewOverview.status === 'ready' ? reviewOverview.envelope : null
  const monthlyRows = reviewEnvelope?.monthly_breakdown ?? []
  const currentMonthStats = monthlyRows[monthlyRows.length - 1]
  const resolution = currentMonthStats
    ? buildReviewResolutionSummary({
        submitted: currentMonthStats.new_requests + currentMonthStats.resubmissions,
        approved: currentMonthStats.approvals,
        rejected: currentMonthStats.rejections,
      })
    : buildReviewResolutionSummary({ submitted: 0, approved: 0, rejected: 0 })
  const dueSoonProjectCount = projectReminderItems.filter(({ days }) => days != null && days <= 7).length
  const todayLabel = new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  }).format(new Date())
  const resolutionLabel = reviewOverview.status === 'loading'
    ? '이번 달 검토 흐름 집계 중'
    : reviewOverview.status === 'error'
      ? '이번 달 검토 흐름을 불러오지 못함'
      : resolution.percent == null
        ? '이번 달 제출 없음'
        : `이번 달 제출 대비 종결 ${resolution.percent}퍼센트, 종결 ${resolution.resolved}건, 남음 ${resolution.remaining}건`

  return (
    <div className="stack leader-dashboard">
      <div className="page-intro dashboard-page-intro">
        <h1>파트 운영 현황</h1>
        <p>{todayLabel} 기준으로 실제 업무 데이터만 요약합니다.</p>
      </div>

      <section className="dashboard-hero leader-dashboard-hero" aria-labelledby="leader-dashboard-title">
        <div className="dashboard-hero-copy">
          <span className="dashboard-hero-eyebrow">오늘의 운영 브리핑</span>
          <h2 id="leader-dashboard-title">
            <span>안녕하세요, {profile.name}님.</span>
            <strong>
              먼저 확인할 항목이 <em>{priorityQueue.length}건</em> 있습니다.
            </strong>
          </h2>
          <p>검토 대기, 마감 일정, 담당 공백을 시급한 순서로 묶었습니다.</p>
          <div className="dashboard-hero-pills" aria-label="오늘의 주의 항목">
            <span>대기 검토 {pendingReviews.length}건</span>
            <span>7일 이내 프로젝트 {dueSoonProjectCount}건</span>
            <span>담당 공백 제품 {unassignedProducts.length}개</span>
          </div>
        </div>
        <div className="dashboard-resolution-panel">
          <span>이번 달 검토 흐름</span>
          <div
            aria-label={resolutionLabel}
            className="dashboard-resolution-ring"
            role="img"
            style={{ '--dashboard-progress': resolution.percent ?? 0 } as CSSProperties}
          >
            <div>
              <strong>{reviewOverview.status === 'loading' ? '집계 중' : resolution.percent == null ? '—' : `${resolution.percent}%`}</strong>
              <small>제출 대비 종결</small>
            </div>
          </div>
          {reviewOverview.status === 'error' ? (
            <small className="dashboard-resolution-error" title={reviewOverview.message}>집계를 확인해 주세요.</small>
          ) : (
            <small>제출 {resolution.submitted}건 · 종결 {resolution.resolved}건 · 남음 {resolution.remaining}건</small>
          )}
          <small className="dashboard-resolution-basis">이벤트 발생일 · Asia/Seoul 기준</small>
        </div>
      </section>

      <DashboardMetricStrip
        label="핵심 업무 지표"
        metrics={[
          { label: '대기 검토', value: pendingReviews.length, unit: '건', note: '파트장 확인 대기', icon: <Inbox size={16} aria-hidden="true" />, onOpen: () => setActiveTab('reviews') },
          { label: '마감 임박 프로젝트', value: dueSoonProjectCount, unit: '건', note: '7일 이내 마감', icon: <CalendarClock size={16} aria-hidden="true" />, tone: dueSoonProjectCount > 0 ? 'warning' : undefined, onOpen: () => setActiveTab('projects') },
          { label: '미배정 제품', value: unassignedProducts.length, unit: '개', note: '담당자 지정 필요', icon: <Package size={16} aria-hidden="true" />, tone: unassignedProducts.length > 0 ? 'warning' : undefined, onOpen: () => setActiveTab('products') },
          { label: '미적용 변경업무', value: pendingChangeContexts.length, unit: '건', note: `미지정·기한 초과 ${riskyChangeCount}건`, icon: <ClipboardPenLine size={16} aria-hidden="true" />, tone: riskyChangeCount > 0 ? 'warning' : undefined, onOpen: () => setActiveTab('change-applications') },
          { label: '최종 확인 대기', value: finalReviewApplications.length, unit: '건', note: '제품 처리 완료 · 파트장 확인 필요', icon: <CheckCircle2 size={16} aria-hidden="true" />, tone: finalReviewApplications.length > 0 ? 'success' : undefined, onOpen: () => setActiveTab('change-applications', finalReviewApplications[0]?.id) },
        ]}
      />

      <div className="leader-dashboard-grid">
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

        <Section title="진행 중 프로젝트" icon={<FolderKanban size={18} />} aside={`${activeProjects.length}개`}>
          <div className="dashboard-project-list">
            {activeProjects.length === 0 && (
              <EmptyState
                icon={<FolderKanban size={22} />}
                title="진행 중인 프로젝트가 없습니다."
                description="새 프로젝트를 등록하면 마감 순서로 표시됩니다."
              />
            )}
            {activeProjects.slice(0, PROJECT_PREVIEW_COUNT).map((project) => {
              const assigneeNames = data.projectAssignments
                .filter((assignment) => assignment.project_id === project.id)
                .map((assignment) => (assignment.profiles ?? data.profiles.find((item) => item.id === assignment.user_id))?.name)
                .filter((name): name is string => Boolean(name))
              return (
                <button
                  className="dashboard-project-row"
                  key={project.id}
                  onClick={() => setActiveTab('projects', project.id)}
                  type="button"
                >
                  <span className="dashboard-project-main">
                    <strong>{project.name}</strong>
                    <small>{assigneeNames.length > 0 ? assigneeNames.join(', ') : '담당자 미지정'}</small>
                  </span>
                  <span className="dashboard-project-meta">
                    <small>{projectStatusLabels[project.status]}</small>
                    <strong title={formatDate(project.deadline)}>{dueDateLabel(project.deadline)}</strong>
                  </span>
                  <ChevronRight aria-hidden="true" size={16} />
                </button>
              )
            })}
            {activeProjects.length > PROJECT_PREVIEW_COUNT && (
              <button className="activity-more" onClick={() => setActiveTab('projects')} type="button">
                프로젝트 {activeProjects.length}개 전체 보기 →
              </button>
            )}
          </div>
        </Section>
      </div>

      <div className="leader-dashboard-grid dashboard-secondary-grid">
        <Section title="월간 검토 처리" icon={<CalendarClock size={18} />} aside="서버 집계 · 최근 6개월">
          <div>
            {reviewOverview.status === 'loading' && (
              <div className="dashboard-inline-loading" role="status">검토 통계를 집계하는 중입니다.</div>
            )}
            {reviewOverview.status === 'error' && (
              <div className="dashboard-inline-error" role="alert" title={reviewOverview.message}>
                검토 통계를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.
              </div>
            )}
            <div aria-busy={reviewOverview.status === 'loading'} className="stats-kpi-grid">
              {[
                {
                  label: '이번 달 제출',
                  value: reviewOverview.status === 'ready'
                    ? (currentMonthStats?.new_requests ?? 0) + (currentMonthStats?.resubmissions ?? 0)
                    : null,
                },
                { label: '완료', value: reviewOverview.status === 'ready' ? currentMonthStats?.approvals ?? 0 : null },
                { label: '반려', value: reviewOverview.status === 'ready' ? currentMonthStats?.rejections ?? 0 : null },
                { label: '기간 내 현재 대기', value: reviewOverview.status === 'ready' ? reviewEnvelope?.pending_count ?? 0 : null },
              ].map(({ label, value }) => (
                <article className="kpi" key={label}>
                  <div className="kpi-label">{label}</div>
                  <div className="kpi-value">
                    {value ?? '—'}
                    {value !== null && <span className="unit">건</span>}
                  </div>
                </article>
              ))}
            </div>

            {reviewOverview.status === 'ready' && monthlyRows.length > 0 && (
              <>
                <div className="sparkline-container">
                  <div className="sparkline-head">
                    <strong>월별 이벤트 추이</strong>
                    <div className="sparkline-legend">
                      <span><i className="swatch" aria-hidden="true" />제출</span>
                      <span><i className="swatch done" aria-hidden="true" />완료</span>
                    </div>
                  </div>
                  <Sparkline
                    submitted={monthlyRows.map((row) => row.new_requests + row.resubmissions)}
                    approved={monthlyRows.map((row) => row.approvals)}
                  />
                </div>

                <div className="month-history" style={{ marginTop: 18 }}>
                  <div className="month-history-row dashboard-month-row head">
                    <span>월</span><span>제출</span><span>완료</span><span>반려</span>
                  </div>
                  {monthlyRows.map((row) => (
                    <div className="month-history-row dashboard-month-row" key={row.month}>
                      <span className="m">{row.month}</span>
                      <span>{row.new_requests + row.resubmissions}</span>
                      <span>{row.approvals}</span>
                      <span>{row.rejections}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {reviewOverview.status === 'ready' && monthlyRows.length === 0 && (
              <p className="empty-copy">집계 기간에 표시할 검토 이벤트가 없습니다.</p>
            )}
          </div>
        </Section>

        <Section title="팀 담당 배분" icon={<Users size={18} />} aside="담당 항목 수">
          <div className="team-allocation-list">
            {teamAllocations.length === 0 && (
              <EmptyState icon={<Users size={22} />} title="표시할 파트원이 없습니다." description="활성 파트원이 등록되면 담당 범위를 비교합니다." />
            )}
            {teamAllocations.map((row) => (
              <div className="team-allocation-row" key={row.member.id}>
                <div className="team-allocation-head">
                  <strong>{row.member.name}</strong>
                  <span>총 {row.totalCount}개</span>
                </div>
                <div
                  aria-label={`${row.member.name} 담당 항목 총 ${row.totalCount}개, 제품 ${row.productCount}개, 정기 업무 ${row.dutyCount}개, 진행 중 프로젝트 ${row.activeProjectCount}개`}
                  className="team-allocation-track"
                  role="img"
                  style={{ '--allocation-percent': `${row.relativePercent}%` } as CSSProperties}
                >
                  <span />
                </div>
                <small>제품 {row.productCount} · 업무 {row.dutyCount} · 진행 프로젝트 {row.activeProjectCount}</small>
              </div>
            ))}
            <p className="team-allocation-note">막대는 항목 수의 상대 비교이며 업무량·난이도·성과를 뜻하지 않습니다.</p>
          </div>
        </Section>
      </div>

      {unassignedProducts.length > 0 && (
        <button className="operations-callout" onClick={() => setActiveTab('products')} type="button">
          <Package size={18} aria-hidden="true" />
          <span>
            <strong>담당자가 없는 제품 {unassignedProducts.length}개</strong>
            <small>{unassignedProducts.slice(0, 4).map((product) => product.name).join(', ')}</small>
          </span>
          <span className="operations-callout-arrow">배정하기 →</span>
        </button>
      )}
    </div>
  )
}
