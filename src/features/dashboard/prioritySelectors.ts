import type { TabId } from '../../app/types'
import type { AppData, Product, Profile } from '../../types'
import { daysUntil, dueState, eventTime, relativeDateLabel, type DueKind, type DueState } from '../../lib/dates'
import { formatDate } from '../../lib/format'
import { selectChangeApplicationSummary, selectProductChangeTaskContexts } from '../change-applications/selectors'

export type PriorityUrgency = 'urgent' | 'warning' | 'normal'

/** 할 일의 종류. 홈의 필터 칩이 이 값으로 목록을 거른다. */
export type PriorityCategory = 'review' | 'change' | 'final' | 'project' | 'product' | 'member'

/** 할 일 목록을 급한 순서의 소그룹으로 나눈다. */
export type PriorityGroupKey = 'overdue' | 'today' | 'week' | 'confirm' | 'assign' | 'later'

export type PriorityItem = {
  id: string
  category: PriorityCategory
  /** 종류 칩 문구 */
  kind: string
  title: string
  /** 요청자·담당자·마감일 같은 보조 정보 한 줄 */
  meta: string
  /** 오른쪽 상태 칩(기한 등) */
  statusLabel: string
  statusTone: DueState['tone']
  dueKind: DueKind
  /** 오늘 기준 남은 일수(지났으면 음수). 기한이 없으면 null. */
  days: number | null
  urgency: PriorityUrgency
  group: PriorityGroupKey
  /** 행마다 붙는 다음 행동 버튼 문구 */
  action: string
  targetTab: TabId
  entityId?: string
  /** 같은 기한끼리의 정렬 기준(오래된 것 먼저). epoch ms */
  at: number
}

export const PRIORITY_GROUPS: Array<{ key: PriorityGroupKey; label: string; urgency: PriorityUrgency }> = [
  { key: 'overdue', label: '기한 지남', urgency: 'urgent' },
  { key: 'today', label: '오늘·내일 마감', urgency: 'urgent' },
  { key: 'week', label: '7일 안에 마감', urgency: 'warning' },
  { key: 'confirm', label: '최종 확인 필요', urgency: 'normal' },
  { key: 'assign', label: '담당자 배정 필요', urgency: 'normal' },
  { key: 'later', label: '여유 있음 · 기한 없음', urgency: 'normal' },
]

export type PriorityFilter = 'all' | 'review' | 'overdue-project' | 'change' | 'product'

/** 홈 머리말의 필터 칩. 숫자는 칩을 눌렀을 때 보이는 행 수와 같다. */
export const PRIORITY_FILTERS: Array<{ key: PriorityFilter; label: string; tone?: 'urgent' }> = [
  { key: 'all', label: '전체' },
  { key: 'review', label: '검토 대기' },
  { key: 'overdue-project', label: '기한 지난 프로젝트', tone: 'urgent' },
  { key: 'change', label: '미적용 변경' },
  { key: 'product', label: '담당자 없는 제품' },
]

export function isPriorityFilter(value: unknown): value is PriorityFilter {
  return PRIORITY_FILTERS.some((filter) => filter.key === value)
}

export function matchesPriorityFilter(item: PriorityItem, filter: PriorityFilter) {
  switch (filter) {
    case 'review':
      return item.category === 'review'
    case 'overdue-project':
      return item.category === 'project' && item.dueKind === 'overdue'
    case 'change':
      return item.category === 'change'
    case 'product':
      return item.category === 'product'
    default:
      return true
  }
}

const GROUP_RANK: Record<PriorityGroupKey, number> = { overdue: 0, today: 1, week: 2, confirm: 3, assign: 4, later: 5 }
const CATEGORY_RANK: Record<PriorityCategory, number> = { review: 0, change: 1, final: 2, project: 3, product: 4, member: 5 }

function groupForDue(due: DueState): PriorityGroupKey {
  if (due.kind === 'overdue') return 'overdue'
  if (due.kind === 'today' || due.kind === 'tomorrow') return 'today'
  if (due.kind === 'soon') return 'week'
  return 'later'
}

function urgencyForDue(due: DueState): PriorityUrgency {
  if (due.tone === 'urgent') return 'urgent'
  if (due.tone === 'warning') return 'warning'
  return 'normal'
}

function dueFields(due: DueState) {
  return {
    statusLabel: due.shortLabel,
    statusTone: due.tone,
    dueKind: due.kind,
    days: due.days,
    urgency: urgencyForDue(due),
    group: groupForDue(due),
  }
}

export function selectUnassignedProducts(data: AppData): Product[] {
  const assignedProductIds = new Set(data.productAssignments.map((assignment) => assignment.product_id))
  return data.products.filter((product) => !assignedProductIds.has(product.id))
}

export function selectMembersWithAssignmentGaps(data: AppData, teamMembers: Profile[]): Profile[] {
  return teamMembers.filter(
    (member) =>
      member.is_active !== false && (
        !data.productAssignments.some((assignment) => assignment.user_id === member.id) ||
        !data.dutyAssignments.some((assignment) => assignment.user_id === member.id)
      ),
  )
}

/** 진행 중(배포됨·최종 완료 전)인 공통변경의 미적용 업무. */
function selectActivePendingChangeContexts(data: AppData) {
  return selectProductChangeTaskContexts(data).filter(
    ({ task, application }) =>
      application.status === 'published'
      && !application.final_completed_at
      && !application.archived_at
      && task.status === 'pending',
  )
}

/** 담당자가 없는 제품과, 그 때문에 멈춰 있는 적용 업무 수(홈 오른쪽 안내). */
export function selectUnassignedProductImpact(data: AppData) {
  const products = selectUnassignedProducts(data)
  const productIds = new Set(products.map((product) => product.id))
  const blockedTaskCount = selectActivePendingChangeContexts(data).filter(
    ({ task }) => productIds.has(task.product_id),
  ).length
  return { products, blockedTaskCount }
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

function productMeta(product: Product, blockedTaskCount: number) {
  if (blockedTaskCount > 0) return `적용 업무 ${blockedTaskCount}건이 멈춰 있어요`
  return [product.category, product.company_name].filter(Boolean).join(' · ') || '담당자를 정해 주세요'
}

function memberGapMeta(noProducts: boolean, noDuties: boolean) {
  if (noProducts && noDuties) return '담당 제품과 정기 업무가 없어요'
  return noProducts ? '담당 제품이 없어요' : '정기 업무가 없어요'
}

/**
 * 파트장 홈 ‘오늘 처리할 일’ 목록. 급한 그룹(기한 지남 → 오늘·내일 → 7일 안 → 최종 확인 →
 * 담당자 배정 → 여유) 순서로, 같은 그룹 안에서는 검토요청 → 공통변경 → 프로젝트 순, 그 안에서는
 * 기한이 급한 것부터 보여 준다. 기한 표기는 dueState 하나로 통일한다(끝난 일에는 기한 경과를 붙이지 않는다).
 */
export function selectLeaderPriorityQueue(data: AppData, teamMembers: Profile[], now = new Date()): PriorityItem[] {
  const items: PriorityItem[] = []

  for (const request of data.reviewRequests) {
    if (request.status !== 'pending') continue
    const submittedAt = request.last_submitted_at ?? request.created_at
    const resubmitted = (request.review_round ?? 1) > 1
    items.push({
      id: `review-${request.id}`,
      category: 'review',
      kind: '검토요청',
      title: request.title,
      meta: `${request.profiles?.name ?? '요청자'} · ${relativeDateLabel(submittedAt, now.getTime())} ${resubmitted ? '다시 요청' : '요청'}`,
      ...dueFields(dueState(request.due_date, { now })),
      action: '검토하기',
      targetTab: 'reviews',
      entityId: request.id,
      at: eventTime(submittedAt),
    })
  }

  const changeGroups = new Map<string, ReturnType<typeof selectActivePendingChangeContexts>>()
  for (const context of selectActivePendingChangeContexts(data)) {
    const group = changeGroups.get(context.application.id) ?? []
    group.push(context)
    changeGroups.set(context.application.id, group)
  }
  for (const contexts of changeGroups.values()) {
    const application = contexts[0].application
    const earliest = contexts.reduce((left, right) =>
      right.actionItem.due_date < left.actionItem.due_date ? right : left,
    )
    const due = dueState(earliest.actionItem.due_date, { now })
    const unassigned = contexts.filter(({ task }) => !task.assignee_id).length
    const dueSoon = due.days != null && due.days <= 3
    if (!dueSoon && unassigned === 0) continue
    const fields = dueFields(due)
    items.push({
      id: `change-${application.id}`,
      category: 'change',
      kind: '변경 적용',
      title: application.title,
      meta: `${application.change_number} · 미적용 ${contexts.length}건${unassigned > 0 ? ` · 담당자 없음 ${unassigned}건` : ''}`,
      ...fields,
      group: !dueSoon && unassigned > 0 ? 'assign' : fields.group,
      action: '확인하기',
      targetTab: 'change-applications',
      entityId: application.id,
      at: eventTime(earliest.actionItem.due_date),
    })
  }

  for (const application of data.changeApplications) {
    if (selectChangeApplicationSummary(data, application.id)?.workflow_status !== 'final_review_ready') continue
    items.push({
      id: `final-${application.id}`,
      category: 'final',
      kind: '변경 적용',
      title: application.title,
      meta: `${application.change_number} · 모든 제품 처리를 마쳤어요`,
      statusLabel: '최종 확인',
      statusTone: 'normal',
      dueKind: 'none',
      days: null,
      urgency: 'normal',
      group: 'confirm',
      action: '확인하기',
      targetTab: 'change-applications',
      entityId: application.id,
      at: eventTime(application.updated_at),
    })
  }

  for (const { project, assigneeNames } of selectProjectReminderItems(data, now)) {
    const due = dueState(project.deadline, { now })
    items.push({
      id: `project-${project.id}`,
      category: 'project',
      kind: '프로젝트',
      title: project.name,
      meta: `${assigneeNames.length > 0 ? assigneeNames.join(', ') : '담당자 없음'} · ${formatDate(project.deadline)} 마감`,
      ...dueFields(due),
      action: due.kind === 'overdue' ? '기한 조정' : '확인하기',
      targetTab: 'projects',
      entityId: project.id,
      at: eventTime(project.deadline),
    })
  }

  const { products: unassignedProducts } = selectUnassignedProductImpact(data)
  const pendingByProduct = new Map<string, number>()
  for (const { task } of selectActivePendingChangeContexts(data)) {
    pendingByProduct.set(task.product_id, (pendingByProduct.get(task.product_id) ?? 0) + 1)
  }
  for (const product of unassignedProducts) {
    items.push({
      id: `product-${product.id}`,
      category: 'product',
      kind: '제품',
      title: product.name,
      meta: productMeta(product, pendingByProduct.get(product.id) ?? 0),
      statusLabel: '담당자 없음',
      statusTone: 'warning',
      dueKind: 'none',
      days: null,
      urgency: 'normal',
      group: 'assign',
      action: '담당자 배정하기',
      targetTab: 'products',
      at: eventTime(product.created_at),
    })
  }

  for (const member of selectMembersWithAssignmentGaps(data, teamMembers)) {
    const noProducts = !data.productAssignments.some((assignment) => assignment.user_id === member.id)
    const noDuties = !data.dutyAssignments.some((assignment) => assignment.user_id === member.id)
    items.push({
      id: `member-${member.id}`,
      category: 'member',
      kind: '파트원',
      title: member.name,
      meta: memberGapMeta(noProducts, noDuties),
      statusLabel: '배정 필요',
      statusTone: 'normal',
      dueKind: 'none',
      days: null,
      urgency: 'normal',
      group: 'assign',
      action: '확인하기',
      targetTab: 'team',
      entityId: member.id,
      at: 0,
    })
  }

  // 같은 그룹 안에서는 파트장이 바로 처리하는 일(검토 → 공통변경)을 먼저, 그다음 기한이 급한 순서로 둔다.
  return items.sort((left, right) =>
    GROUP_RANK[left.group] - GROUP_RANK[right.group]
    || CATEGORY_RANK[left.category] - CATEGORY_RANK[right.category]
    || (left.days ?? Number.MAX_SAFE_INTEGER) - (right.days ?? Number.MAX_SAFE_INTEGER)
    || left.at - right.at
    || left.title.localeCompare(right.title, 'ko'),
  )
}
