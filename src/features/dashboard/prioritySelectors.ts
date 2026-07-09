import type { TabId } from '../../app/types'
import type { AppData, Product, Profile } from '../../types'
import { daysUntil, dueDateLabel, dueUrgency } from '../../lib/dates'
import { formatDate, reviewStatusLabels } from '../../lib/format'
import { reviewPriorityScore } from '../../lib/priority'

export type PriorityUrgency = 'urgent' | 'warning' | 'normal'

/** 우선순위 큐를 시급도 순서의 소그룹으로 나눈다. */
export type PriorityGroupKey = 'overdue' | 'week' | 'assign' | 'later'

export type PriorityItem = {
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

export const PRIORITY_GROUPS: Array<{ key: PriorityGroupKey; label: string; urgency: PriorityUrgency }> = [
  { key: 'overdue', label: '지연 · 오늘', urgency: 'urgent' },
  { key: 'week', label: '이번 주', urgency: 'warning' },
  { key: 'assign', label: '배정 필요', urgency: 'normal' },
  { key: 'later', label: '기한 여유 · 없음', urgency: 'normal' },
]

export function selectUnassignedProducts(data: AppData): Product[] {
  const assignedProductIds = new Set(data.productAssignments.map((assignment) => assignment.product_id))
  return data.products.filter((product) => !assignedProductIds.has(product.id))
}

export function selectMembersWithAssignmentGaps(data: AppData, teamMembers: Profile[]): Profile[] {
  return teamMembers.filter(
    (member) =>
      !data.productAssignments.some((assignment) => assignment.user_id === member.id) ||
      !data.dutyAssignments.some((assignment) => assignment.user_id === member.id),
  )
}

export type ProjectReminderItem = {
  project: AppData['projects'][number]
  days: number | null
  assigneeNames: string[]
}

/** 마감 14일 이내의 미종결 프로젝트. 프로젝트 단위로 센다 —
 *  배정 행 단위로 세면 담당자 수만큼 부풀고, 무배정 프로젝트는 누락된다. */
export function selectProjectReminderItems(data: AppData, now = new Date()): ProjectReminderItem[] {
  return data.projects
    .map((project) => {
      const days = daysUntil(project.deadline, now)
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
}

function urgencyGroup(urgency: PriorityUrgency): PriorityGroupKey {
  return urgency === 'urgent' ? 'overdue' : urgency === 'warning' ? 'week' : 'later'
}

/**
 * 파트장 홈 '먼저 확인할 항목' 큐. 점수 오름차순 정렬:
 * 검토요청은 reviewPriorityScore, 프로젝트는 3000+D-day, 배정 공백은 5000/5100 고정.
 */
export function selectLeaderPriorityQueue(data: AppData, teamMembers: Profile[], now = new Date()): PriorityItem[] {
  const openReviewRequests = data.reviewRequests
    .filter((request) => request.status === 'pending')
    .sort((left, right) => reviewPriorityScore(left, now) - reviewPriorityScore(right, now))
  const projectReminderItems = selectProjectReminderItems(data, now)
  const unassignedProducts = selectUnassignedProducts(data)
  const membersWithAssignmentGaps = selectMembersWithAssignmentGaps(data, teamMembers)

  return [
    ...openReviewRequests.map((request) => {
      const urgency = dueUrgency(request.due_date, now)
      return {
        id: `review-${request.id}`,
        kind: '검토요청',
        title: request.title,
        who: request.profiles?.name ?? '요청자',
        dueLabel: request.due_date ? dueDateLabel(request.due_date, now) : '기한 없음',
        dueDetail: request.due_date ? formatDate(request.due_date) : reviewStatusLabels[request.status],
        urgency,
        targetTab: 'reviews' as TabId,
        entityId: request.id,
        score: reviewPriorityScore(request, now),
        group: urgencyGroup(urgency),
      }
    }),
    ...projectReminderItems.map(({ project, days, assigneeNames }) => {
      // 8~14일 뒤 마감은 '이번 주'가 아니다 — normal로 두면 '기한 여유' 그룹으로 내려간다.
      const urgency: PriorityUrgency =
        days != null && days <= 3 ? 'urgent' : days != null && days <= 7 ? 'warning' : 'normal'
      return {
        id: `project-${project.id}`,
        kind: '프로젝트',
        title: project.name,
        who: assigneeNames.length > 0 ? assigneeNames.join(', ') : '담당자 미지정',
        dueLabel: dueDateLabel(project.deadline, now),
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
}
