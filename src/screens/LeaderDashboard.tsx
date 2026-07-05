import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { Badge, FormGrid, IconAction, Kpi, Rows, Section } from '../components/ui'
import type { AppData, Profile, ReviewFeedback, ReviewRequest, ReviewStatus, Role, ProjectStatus } from '../types'
import type { AdminDeleteTable, DeadlineMode, MasterTabId, ReviewStatusFilter, TabId } from '../app/types'
import { recordActivityLog } from '../lib/activityLog'
import { downloadCsv } from '../lib/csv'
import { formatDate, reviewStatusLabels, roleLabels } from '../lib/format'
import { buildReviewMonthlyStats } from '../lib/stats'
import { ageInDays, dueDateLabel, dueDateStatus, daysUntil } from '../lib/dates'
import { reviewPriorityScore } from '../lib/priority'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ClipboardList,
  Download,
  FolderKanban,
  ListFilter,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  StickyNote,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'

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
    .filter((request) => request.status === 'pending' || request.status === 'in_review')
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
  const priorityQueue = [
    ...openReviewRequests.map((request) => ({
      id: `review-${request.id}`,
      kind: '검토요청',
      title: request.title,
      meta: `${request.profiles?.name ?? '요청자'} · ${reviewStatusLabels[request.status]}`,
      due: request.due_date ? `${dueDateLabel(request.due_date)} · ${formatDate(request.due_date)}` : '기한 없음',
      status: dueDateStatus(request.due_date),
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
            targetTab: 'team' as TabId,
            score: 5100,
          },
        ]
      : []),
  ].sort((left, right) => left.score - right.score)
  const visibleActivityLogs = data.activityLogs.slice(0, 6)
  const monthlyStats = buildReviewMonthlyStats(data.reviewRequests)
  const currentMonthStats = monthlyStats[monthlyStats.length - 1]
  const todayLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  return (
    <div className="stack">
      <div className="page-intro">
        <span>{todayLabel}</span>
        <h1>안녕하세요, {profile.name}님</h1>
        <p>
          오늘 먼저 확인해야 할 항목이 <strong>{priorityQueue.length}건</strong> 있습니다.
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
              key={item.id}
              onClick={() =>
                setActiveTab(
                  item.targetTab,
                  'entityId' in item && typeof item.entityId === 'string' ? item.entityId : undefined,
                )
              }
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

      <Section title="월간 검토 처리" icon={<CalendarClock size={18} />}>
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
      </Section>

      <div className="grid two">
        <Section title="팀 워크로드" icon={<Users size={18} />}>
          <div className="workload-list">
            {workloadSummaries.map((summary) => (
              <button className="workload-row" key={summary.member.id} onClick={() => setActiveTab('team')} type="button">
                <span className="avatar-mark">{summary.member.name.slice(0, 1)}</span>
                <span>
                  <strong>{summary.member.name}</strong>
                  <small>
                    제품 {summary.products.length} · 업무 {summary.duties.length} · 프로젝트 {summary.projects.length}
                  </small>
                </span>
                <Badge status={summary.tone}>{summary.label}</Badge>
              </button>
            ))}
          </div>
        </Section>
        <Section title="최근 활동" icon={<MessageSquare size={18} />}>
          <Rows
            empty="아직 기록된 활동이 없습니다."
            rows={visibleActivityLogs.map((log) => ({
              title: log.summary,
              meta: formatDate(log.created_at),
              aside: log.action,
            }))}
          />
          <button className="ghost" onClick={() => setActiveTab('activity')} type="button">
            전체 활동 보기
          </button>
        </Section>
      </div>

      {unassignedProducts.length > 0 && (
        <button className="warm-callout" onClick={() => setActiveTab('products')} type="button">
          <Package size={18} />
          <span>
            <strong>미배정 제품 {unassignedProducts.length}개가 있습니다.</strong>
            <small>{unassignedProducts.slice(0, 4).map((product) => product.name).join(', ')}</small>
          </span>
          <Badge status="pending">마스터 확인</Badge>
        </button>
      )}
    </div>
  )
}

