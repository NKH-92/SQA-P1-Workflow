import type { TabId } from '../../app/types'
import type { AppData, Profile } from '../../types'
import { dueState, eventTime, relativeDateLabel, type DueState } from '../../lib/dates'
import { formatDate, reviewStatusLabels } from '../../lib/format'
import { selectMyProductChangeTaskContexts } from '../change-applications/selectors'

/** 파트원 홈 목록의 항목 종류. 필터 칩이 이 값으로 거른다. */
export type MemberHomeCategory = 'task' | 'project' | 'review'
export type MemberHomeFilter = 'all' | MemberHomeCategory

export type MemberHomeItem = {
  id: string
  category: MemberHomeCategory
  /** 종류 표시. 예: ‘적용 업무 · 자사제품 B’ */
  kind: string
  title: string
  meta: string
  statusLabel: string
  statusTone: DueState['tone']
  urgency: 'urgent' | 'warning' | 'normal'
  targetTab: TabId
  entityId?: string
  rank: number
  days: number | null
  at: number
}

export const MEMBER_HOME_FILTERS: Array<{ key: MemberHomeFilter; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'task', label: '적용 업무' },
  { key: 'project', label: '프로젝트' },
  { key: 'review', label: '검토요청' },
]

export function isMemberHomeFilter(value: unknown): value is MemberHomeFilter {
  return MEMBER_HOME_FILTERS.some((filter) => filter.key === value)
}

/** 기한 상태별 정렬 순서. 지난 일이 가장 먼저, 기한 없는 일이 가장 나중. */
function dueRank(due: DueState) {
  switch (due.kind) {
    case 'overdue':
      return 0
    case 'today':
    case 'tomorrow':
      return 1
    case 'soon':
      return 2
    case 'later':
      return 4
    default:
      return 5
  }
}

function urgencyFor(due: DueState): MemberHomeItem['urgency'] {
  if (due.tone === 'urgent') return 'urgent'
  if (due.tone === 'warning') return 'warning'
  return 'normal'
}

/**
 * 파트원 홈 ‘오늘 할 일’ 목록: 내 미적용 적용 업무, 진행 중인 내 프로젝트, 대기 중이거나 반려된
 * 내 검토요청. 기한 상태는 dueState 하나로 판단한다 — 이미 지난 일을 ‘마감 임박’이라고 하지 않고,
 * 끝난 프로젝트에는 기한 경과를 붙이지 않는다.
 */
export function selectMemberHomeItems(data: AppData, profile: Profile, now = new Date()): MemberHomeItem[] {
  const items: MemberHomeItem[] = []

  for (const { task, actionItem, application } of selectMyProductChangeTaskContexts(data, profile)) {
    if (task.status !== 'pending' || application.final_completed_at) continue
    const due = dueState(actionItem.due_date, { now })
    items.push({
      id: `task-${task.id}`,
      category: 'task',
      kind: `적용 업무 · ${task.product_name}`,
      title: application.title,
      meta: `${application.change_number} · 적용 기한 ${formatDate(actionItem.due_date)}`,
      statusLabel: due.shortLabel,
      statusTone: due.tone,
      urgency: urgencyFor(due),
      targetTab: 'change-applications',
      entityId: application.id,
      rank: dueRank(due),
      days: due.days,
      at: eventTime(actionItem.due_date),
    })
  }

  const seenProjects = new Set<string>()
  for (const assignment of data.projectAssignments) {
    if (assignment.user_id !== profile.id || seenProjects.has(assignment.project_id)) continue
    seenProjects.add(assignment.project_id)
    const project = data.projects.find((item) => item.id === assignment.project_id) ?? assignment.projects ?? null
    if (!project || project.status === 'done') continue
    const due = dueState(project.deadline, { now })
    items.push({
      id: `project-${assignment.project_id}`,
      category: 'project',
      kind: '프로젝트',
      title: project.name,
      meta: project.deadline ? `${formatDate(project.deadline)} 마감` : '마감일 없음',
      statusLabel: due.kind === 'none' ? '마감일 없음' : due.shortLabel,
      statusTone: due.tone,
      urgency: urgencyFor(due),
      targetTab: 'projects',
      entityId: assignment.project_id,
      rank: dueRank(due),
      days: due.days,
      at: eventTime(project.deadline),
    })
  }

  for (const request of data.reviewRequests) {
    if (request.requester_id !== profile.id) continue
    if (request.status !== 'pending' && request.status !== 'rejected') continue
    const rejected = request.status === 'rejected'
    const feedbackCount = (request.review_feedback ?? []).filter((feedback) => !feedback.voided_at).length
    const requestedLabel = `${relativeDateLabel(request.last_submitted_at ?? request.created_at, now.getTime())} 요청`
    items.push({
      id: `review-${request.id}`,
      category: 'review',
      kind: '내 검토요청',
      title: request.title,
      meta: rejected
        ? '반려 사유를 확인하고 고쳐서 다시 요청해 주세요'
        : feedbackCount > 0
          ? `피드백 ${feedbackCount}개 · ${requestedLabel}`
          : `아직 피드백이 없어요 · ${requestedLabel}`,
      statusLabel: reviewStatusLabels[request.status],
      statusTone: rejected ? 'urgent' : 'normal',
      urgency: rejected ? 'warning' : 'normal',
      targetTab: 'reviews',
      entityId: request.id,
      // 반려는 내가 할 일이라 기한 여유보다 앞에, 대기 중은 기다리는 일이라 맨 뒤에 둔다.
      rank: rejected ? 3 : 6,
      days: null,
      at: eventTime(request.last_submitted_at ?? request.created_at),
    })
  }

  return items.sort((left, right) =>
    left.rank - right.rank
    || (left.days ?? Number.MAX_SAFE_INTEGER) - (right.days ?? Number.MAX_SAFE_INTEGER)
    || left.at - right.at
    || left.title.localeCompare(right.title, 'ko'),
  )
}
