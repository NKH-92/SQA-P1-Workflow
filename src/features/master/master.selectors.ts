import type { AppData, Duty, DutyMajorCategory, Product, Profile } from '../../types'
import { roleLabels } from '../../lib/format'
import { selectProductChangeTaskContexts } from '../change-applications/selectors'

export type MasterFeatureData = Pick<
  AppData,
  | 'products'
  | 'productAssignments'
  | 'duties'
  | 'dutyAssignments'
  | 'dutyMajorCategories'
  | 'profiles'
  | 'allowedUsers'
>

const masterNameCollator = new Intl.Collator('ko-KR', { numeric: true, sensitivity: 'base' })

function compareMajorCategories(left: DutyMajorCategory, right: DutyMajorCategory) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || masterNameCollator.compare(left.name, right.name)
}

function compareDuties(left: Duty, right: Duty) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || masterNameCollator.compare(left.name, right.name)
}

function compareMasterProducts(left: Product, right: Product) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || masterNameCollator.compare(left.name, right.name)
}

function matchesMasterSearch(normalizedQuery: string, ...values: Array<string | null | undefined>) {
  return !normalizedQuery || values.filter(Boolean).join(' ').toLowerCase().includes(normalizedQuery)
}

export function selectDutyTableGroups(data: MasterFeatureData) {
  return [...data.dutyMajorCategories].sort(compareMajorCategories).map((category) => ({
    category,
    duties: data.duties
      .filter((duty) => duty.major_category_id === category.id)
      .sort(compareDuties),
  }))
}

type ProductAssignmentRow = AppData['productAssignments'][number]

/** 제품별 담당 배정 목록. 제품 화면이 한 번만 만들어 카드·칩 계산마다 전체 배정을 다시 훑지 않게 한다. */
export type ProductAssignmentsByProduct = ReadonlyMap<string, ProductAssignmentRow[]>

export function groupProductAssignments(assignments: readonly ProductAssignmentRow[]): ProductAssignmentsByProduct {
  const grouped = new Map<string, ProductAssignmentRow[]>()
  for (const assignment of assignments) {
    const list = grouped.get(assignment.product_id)
    if (list) list.push(assignment)
    else grouped.set(assignment.product_id, [assignment])
  }
  return grouped
}

export function selectProductGroups(products: Product[]) {
  const sortedProducts = [...products].sort(compareMasterProducts)
  return {
    ownCompanyProducts: sortedProducts.filter((product) => product.category !== '위탁'),
    consignedProducts: sortedProducts.filter((product) => product.category === '위탁'),
  }
}

/** 제품 목록 위 칩: 전체 · 담당자 없음 · 비활성 담당. 홈 안내에서 ‘unassigned’로 바로 들어온다. */
export type ProductAssigneeFilter = 'all' | 'unassigned' | 'inactive'
type ProductAssigneeState = Exclude<ProductAssigneeFilter, 'all'> | 'assigned'

export function isProductAssigneeFilter(value: unknown): value is ProductAssigneeFilter {
  return value === 'all' || value === 'unassigned' || value === 'inactive'
}

export function selectProductAssigneeStatuses(
  products: Product[],
  assignmentsByProduct: ProductAssignmentsByProduct,
  profilesById: ReadonlyMap<string, Profile>,
) {
  const states = new Map<string, ProductAssigneeState>()
  const counts: Record<ProductAssigneeFilter, number> = { all: products.length, unassigned: 0, inactive: 0 }
  for (const { id } of products) {
    const assignments = assignmentsByProduct.get(id)
    let status: ProductAssigneeState = 'assigned'
    if (!assignments?.length) status = 'unassigned'
    else if (assignments.some((assignment) => profilesById.get(assignment.user_id)?.is_active === false)) status = 'inactive'
    states.set(id, status)
    if (status !== 'assigned') counts[status] += 1
  }
  return { states, counts }
}

export function filterMasterProducts(
  products: Product[],
  query: string,
  filter: ProductAssigneeFilter,
  states: ReadonlyMap<string, ProductAssigneeState>,
) {
  const normalizedQuery = query.trim().toLowerCase()
  if (filter === 'all' && !normalizedQuery) return products
  return products.filter((product) =>
    (filter === 'all' || states.get(product.id) === filter)
    && matchesMasterSearch(normalizedQuery, product.name, product.category, product.company_name, product.unassigned_reason),
  )
}

/** 새 담당자에게 넘길 수 있는 미완료 적용 업무(배포된 공통변경의 미적용 업무 중 다른 사람이 맡은 것). */
export function selectTransferableProductTasks(
  data: Parameters<typeof selectProductChangeTaskContexts>[0],
  productId: string,
  userId: string,
) {
  if (!productId || !userId) return []
  return selectProductChangeTaskContexts(data).filter(
    ({ task, application }) =>
      task.product_id === productId
      && task.status === 'pending'
      && task.assignee_id !== userId
      && application.status === 'published',
  )
}

export function selectFilteredAllowedUsers(data: MasterFeatureData, query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  return data.allowedUsers.filter((item) =>
    matchesMasterSearch(normalizedQuery, item.name, item.email, item.role, roleLabels[item.role]),
  )
}
