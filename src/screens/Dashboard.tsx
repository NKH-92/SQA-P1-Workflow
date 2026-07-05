import type { Dispatch, SetStateAction } from 'react'
import { Badge, Section } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { formatDate, reviewStatusLabels } from '../lib/format'
import { daysUntil, dueDateLabel } from '../lib/dates'
import {
  Check,
  ClipboardList,
  FolderKanban,
  Package,
} from 'lucide-react'

export function Dashboard({
  profile,
  data,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  mutate: (operation: () => Promise<void>, success: string) => Promise<void>
  setData: Dispatch<SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const leaderProfile = data.profiles.find((item) => item.role === 'leader')
  const ownProducts = data.productAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownDuties = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownProjects = data.projectAssignments
    .map((assignment) => ({
      assignment,
      project: assignment.projects ?? data.projects.find((item) => item.id === assignment.project_id) ?? null,
    }))
    .filter(({ assignment }) => assignment.user_id === profile.id)
  const ownReviews = data.reviewRequests
    .filter((request) => request.requester_id === profile.id)
    .sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))
  const openReviews = ownReviews.filter((request) => request.status === 'pending')
  const latestNote = data.profileNotes
    .filter((note) => note.profile_id === profile.id)
    .sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))[0]
  const urgentProjects = ownProjects.filter(({ project }) => {
    if (!project || project.status === 'done') return false
    const days = daysUntil(project.deadline)
    return days != null && days <= 3
  })
  const introMessage =
    urgentProjects.length > 0 ? (
      <>
        오늘 <strong>{urgentProjects.length}개의 프로젝트</strong>가 마감 임박이에요.
      </>
    ) : openReviews.length > 0 ? (
      <>
        답변을 기다리는 검토요청이 <strong>{openReviews.length}건</strong> 있어요.
      </>
    ) : (
      <>오늘은 확인할 급한 항목이 없어요.</>
    )
  const todayLabel = new Intl.DateTimeFormat('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())

  return (
    <div className="stack">
      <div className="page-intro">
        <span>{todayLabel}</span>
        <h1>좋은 아침이에요, {profile.name}님.</h1>
        <p>{introMessage}</p>
      </div>

      {latestNote && (
        <div className="leader-memo">
          <div>
            <span>파트장 메모</span>
            <p>“{latestNote.note}”</p>
            <small>
              {leaderProfile?.name ?? '파트장'} · {formatDate(latestNote.created_at)}
            </small>
          </div>
        </div>
      )}

      <div className="grid split-wide">
        <Section
          title="내 검토요청"
          icon={<Check size={18} />}
          aside={`대기 ${openReviews.length} / 전체 ${ownReviews.length}`}
          flush
        >
          {ownReviews.length === 0 && <p className="empty">아직 보낸 검토요청이 없습니다.</p>}
          <div className="flush-list">
            {ownReviews.slice(0, 4).map((request) => {
              const latestFeedback = request.review_feedback?.[request.review_feedback.length - 1]
              return (
                <button
                  className="review-preview-row"
                  key={request.id}
                  onClick={() => setActiveTab('reviews', request.id)}
                  type="button"
                >
                  <span className="review-preview-head">
                    <Badge status={request.status}>{reviewStatusLabels[request.status]}</Badge>
                    <strong>{request.title}</strong>
                    <time>{formatDate(request.created_at)}</time>
                  </span>
                  {latestFeedback ? (
                    <span className="feedback-quote">
                      <em>“{latestFeedback.comment}”</em>
                    </span>
                  ) : (
                    <span className="no-feedback">
                      아직 피드백이 없어요 · {request.status === 'pending' ? '파트장 확인 대기 중' : reviewStatusLabels[request.status]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Section>

        <Section title="배정된 프로젝트" icon={<FolderKanban size={18} />} aside={`${ownProjects.length}개`} flush>
          {ownProjects.length === 0 && <p className="empty">배정된 프로젝트가 없습니다.</p>}
          <div className="flush-list">
            {ownProjects.map(({ assignment, project }) => {
              const days = daysUntil(project?.deadline)
              const urgent = project?.status !== 'done' && days != null && days <= 3
              return (
                <div className="project-preview-row" key={assignment.id}>
                  <div className="project-preview-head">
                    <strong>{project?.name ?? assignment.project_id}</strong>
                    <span className={urgent ? 'due urgent' : 'due'}>
                      {project?.deadline ? dueDateLabel(project.deadline) : '기한 없음'}
                    </span>
                  </div>
                  <small>{project?.description || '설명 없음'}</small>
                </div>
              )
            })}
          </div>
        </Section>
      </div>

      <div className="grid split-narrow">
        <Section title="담당제품" icon={<Package size={18} />} aside={`${ownProducts.length}개`}>
          {ownProducts.length === 0 && <p className="empty">담당제품이 없습니다.</p>}
          <div className="product-tile-grid">
            {ownProducts.map((assignment) => {
              const name = assignment.products?.name ?? assignment.product_id
              const companyName = assignment.products?.company_name ?? (assignment.products?.category === '자사' ? '자사' : null)
              return (
                <div className="product-tile" key={assignment.id}>
                  <div>
                    <strong>{name}</strong>
                    <small>{companyName ?? '회사명 없음'}</small>
                  </div>
                </div>
              )
            })}
          </div>
        </Section>

        <Section title="담당업무" icon={<ClipboardList size={18} />} aside="정기 업무">
          {ownDuties.length === 0 && <p className="empty">담당업무가 없습니다.</p>}
          <ul className="duty-list">
            {ownDuties.map((assignment) => (
              <li key={assignment.id}>
                <strong>{assignment.duties?.name ?? assignment.duty_id}</strong>
                {assignment.duties?.duty_major_categories?.name && (
                  <small>{assignment.duties.duty_major_categories.name}</small>
                )}
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </div>
  )
}
