import type { Dispatch, SetStateAction } from 'react'
import { Badge, EmptyState, Section } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId } from '../app/types'
import { formatDate, reviewStatusLabels } from '../lib/format'
import { daysUntil, dueDateLabel, relativeDateLabel } from '../lib/dates'
import { productCategory, productCompanyName, productName } from '../lib/products'
import {
  Check,
  ClipboardList,
  FolderKanban,
  Package,
  Send,
} from 'lucide-react'

/** 홈의 카드 4개가 같은 리듬을 갖도록 미리보기 건수를 통일한다. 전체는 각 탭에서 본다. */
const HOME_PREVIEW_COUNT = 4

export function Dashboard({
  profile,
  data,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  mutate: MutateFn
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
        <h1>좋은 아침이에요, {profile.name}님.</h1>
        <p>
          {todayLabel} · {introMessage}
        </p>
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

      {/* 카드 4개는 1:1 그리드 2행 + 동일한 flush 미리보기 문법으로 균형을 맞춘다. */}
      <div className="grid two">
        <Section
          title="내 검토요청"
          icon={<Check size={18} />}
          aside={`대기 ${openReviews.length} / 전체 ${ownReviews.length}`}
          flush
        >
          {ownReviews.length === 0 && (
            <EmptyState
              icon={<Check size={22} />}
              title="아직 보낸 검토요청이 없습니다."
              description="검토가 필요한 문서나 판단을 파트장에게 요청해 보세요."
              action={
                <button className="ghost compact" onClick={() => setActiveTab('reviews')} type="button">
                  <Send size={14} />
                  검토요청 보내기
                </button>
              }
            />
          )}
          <div className="flush-list">
            {ownReviews.slice(0, HOME_PREVIEW_COUNT).map((request) => {
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
                    <time title={formatDate(request.created_at)}>{relativeDateLabel(request.created_at)}</time>
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
            {ownReviews.length > HOME_PREVIEW_COUNT && (
              <button className="activity-more" onClick={() => setActiveTab('reviews')} type="button">
                검토요청 {ownReviews.length}건 전체 보기 →
              </button>
            )}
          </div>
        </Section>

        <Section title="배정된 프로젝트" icon={<FolderKanban size={18} />} aside={`${ownProjects.length}개`} flush>
          {ownProjects.length === 0 && (
            <EmptyState
              icon={<FolderKanban size={22} />}
              title="배정된 프로젝트가 없습니다."
              description="파트장이 프로젝트를 배정하면 여기에 표시됩니다."
            />
          )}
          <div className="flush-list">
            {ownProjects.slice(0, HOME_PREVIEW_COUNT).map(({ assignment, project }) => {
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
            {ownProjects.length > HOME_PREVIEW_COUNT && (
              <button className="activity-more" onClick={() => setActiveTab('projects')} type="button">
                프로젝트 {ownProjects.length}개 전체 보기 →
              </button>
            )}
          </div>
        </Section>
      </div>

      {/* 홈은 "오늘 볼 것" 요약만 보여주고, 담당 범위 전체는 '내 담당' 화면에서 본다. */}
      <div className="grid two">
        <Section title="담당제품" icon={<Package size={18} />} aside={`${ownProducts.length}개`} flush>
          {ownProducts.length === 0 && (
            <EmptyState icon={<Package size={22} />} title="담당제품이 없습니다." description="배정은 파트장에게 문의하세요." />
          )}
          <div className="flush-list">
            {ownProducts.slice(0, HOME_PREVIEW_COUNT).map((assignment) => {
              // 배지가 이미 자사/위탁을 말하므로, 부제는 의미 있는 회사명일 때만 남긴다.
              const meta = productCompanyName(assignment)
              return (
                <div className="project-preview-row" key={assignment.id}>
                  <div className="project-preview-head">
                    <strong>{productName(assignment)}</strong>
                    <Badge>{productCategory(assignment)}</Badge>
                  </div>
                  {meta && <small>{meta}</small>}
                </div>
              )
            })}
            {ownProducts.length > HOME_PREVIEW_COUNT && (
              <button className="activity-more" onClick={() => setActiveTab('work')} type="button">
                담당제품 {ownProducts.length}개 전체 보기 →
              </button>
            )}
          </div>
        </Section>

        <Section title="담당업무" icon={<ClipboardList size={18} />} aside={`정기 업무 ${ownDuties.length}개`} flush>
          {ownDuties.length === 0 && (
            <EmptyState icon={<ClipboardList size={22} />} title="담당업무가 없습니다." description="배정은 파트장에게 문의하세요." />
          )}
          <div className="flush-list">
            {ownDuties.slice(0, HOME_PREVIEW_COUNT).map((assignment) => (
              <div className="project-preview-row" key={assignment.id}>
                <div className="project-preview-head">
                  <strong>{assignment.duties?.name ?? assignment.duty_id}</strong>
                </div>
                <small>{assignment.duties?.duty_major_categories?.name ?? '대분류 없음'}</small>
              </div>
            ))}
            {ownDuties.length > HOME_PREVIEW_COUNT && (
              <button className="activity-more" onClick={() => setActiveTab('work')} type="button">
                담당업무 {ownDuties.length}개 전체 보기 →
              </button>
            )}
          </div>
        </Section>
      </div>
    </div>
  )
}
