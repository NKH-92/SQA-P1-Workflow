import type { Dispatch, SetStateAction } from 'react'
import { Badge, Rows, Section } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { formatDate, projectStatusLabels, reviewStatusLabels } from '../lib/format'
import { dueDateLabel } from '../lib/dates'
import { reviewPriorityScore } from '../lib/priority'
import {
  Bell,
  Check,
  ClipboardList,
  FolderKanban,
  Package,
  StickyNote,
} from 'lucide-react'

export function Dashboard({
  profile,
  data,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const ownProducts = data.productAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownDuties = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownProjects = data.projectAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownReviews = data.reviewRequests.filter((request) => request.requester_id === profile.id)
  const ownNotes = data.profileNotes.filter((note) => note.profile_id === profile.id)
  const ownReminders = [
    ...ownReviews
      .filter((request) => request.status === 'pending' || request.status === 'in_review')
      .sort((left, right) => reviewPriorityScore(left) - reviewPriorityScore(right))
      .map((request) => ({
        title: request.title,
        meta: `검토요청 · ${reviewStatusLabels[request.status]}`,
        aside: dueDateLabel(request.due_date),
      })),
    ...ownProjects
      .map((assignment) => {
        const project = assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id)
        return {
          title: project?.name ?? assignment.project_id,
          meta: `배정 업무 · ${project?.deadline ? formatDate(project.deadline) : '마감일 없음'}`,
          aside: project?.deadline ? dueDateLabel(project.deadline) : undefined,
          done: project?.status === 'done',
        }
      })
      .filter((item) => !item.done && item.aside && item.aside !== '기한 없음'),
  ]
  const todayLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  return (
      <div className="stack">
        <div className="page-intro">
          <span>{todayLabel}</span>
          <h1>좋은 아침이에요, {profile.name}님.</h1>
          <p>
            오늘 확인할 리마인더가 <strong>{ownReminders.length}건</strong> 있어요.
          </p>
        </div>
        <div className="member-overview">
          <div>
            <span>{profile.name}</span>
            <strong>내 업무 현황</strong>
            <p>{ownProjects.length > 0 ? `진행 프로젝트 ${ownProjects.length}건` : '배정된 프로젝트 없음'}</p>
          </div>
          <div className="overview-metrics">
            <Badge>제품 {ownProducts.length}</Badge>
            <Badge>업무 {ownDuties.length}</Badge>
            <Badge>검토 {ownReviews.length}</Badge>
            <Badge>메모 {ownNotes.length}</Badge>
          </div>
        </div>
        <Section title="내 알림/리마인더" icon={<Bell size={18} />}>
          <Rows
            empty="확인할 검토요청이나 마감 리마인더가 없습니다."
            rows={ownReminders.slice(0, 6)}
          />
        </Section>
        <div className="grid two">
          <Section title="담당제품" icon={<Package size={18} />}>
            <Rows
              empty="담당제품이 없습니다."
              rows={ownProducts.map((assignment) => ({
                title: assignment.products?.name ?? assignment.product_id,
                meta: assignment.products?.code ?? '제품코드 없음',
                aside: assignment.status ?? '-',
              }))}
            />
          </Section>
          <Section title="담당업무" icon={<ClipboardList size={18} />}>
            <Rows
              empty="담당업무가 없습니다."
              rows={ownDuties.map((assignment) => ({
                title: assignment.duties?.name ?? assignment.duty_id,
                meta: '사전 정의 업무',
              }))}
            />
          </Section>
          <Section title="배정 프로젝트" icon={<FolderKanban size={18} />}>
            <Rows
              empty="배정 프로젝트가 없습니다."
              rows={ownProjects.map((assignment) => ({
                title: assignment.projects?.name ?? assignment.project_id,
                meta: assignment.projects?.deadline ? `마감 ${formatDate(assignment.projects.deadline)}` : '마감일 없음',
                aside: assignment.projects?.status ? projectStatusLabels[assignment.projects.status] : '-',
              }))}
            />
          </Section>
          <Section title="내 검토요청" icon={<Check size={18} />}>
            <Rows
              empty="검토요청이 없습니다."
              rows={ownReviews.map((request) => ({
                title: request.title,
                meta: formatDate(request.created_at),
                aside: reviewStatusLabels[request.status],
              }))}
            />
          </Section>
          <Section title="파트장 메모" icon={<StickyNote size={18} />}>
            <Rows
              empty="공유된 관리 메모가 없습니다."
              rows={ownNotes.map((note) => ({
                title: note.note,
                meta: formatDate(note.created_at),
              }))}
            />
          </Section>
        </div>
      </div>
    )
}

