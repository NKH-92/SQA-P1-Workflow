import type { AppData, Duty, DutyMajorCategory } from '../../types'
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

function compareMajorCategories(left: DutyMajorCategory, right: DutyMajorCategory) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
}

function compareDuties(left: Duty, right: Duty) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
}

function compareMasterProducts(left: AppData['products'][number], right: AppData['products'][number]) {
  const leftOrder = left.sort_order ?? Number.MAX_SAFE_INTEGER
  const rightOrder = right.sort_order ?? Number.MAX_SAFE_INTEGER
  return leftOrder - rightOrder || left.name.localeCompare(right.name, 'ko-KR', { numeric: true, sensitivity: 'base' })
}

function selectMasterSearchMatches(query: string, ...values: Array<string | null | undefined>) {
  const normalized = query.trim().toLowerCase()
  if (!normalized) return true
  return values.filter(Boolean).join(' ').toLowerCase().includes(normalized)
}

function selectFilteredProducts(data: MasterFeatureData, query: string) {
  return data.products.filter((item) =>
    selectMasterSearchMatches(query, item.name, item.category, item.company_name, item.unassigned_reason),
  )
}

function selectFilteredDuties(data: MasterFeatureData, query: string) {
  return data.duties.filter((item) =>
    selectMasterSearchMatches(
      query,
      item.name,
      item.duty_major_categories?.name,
      data.dutyMajorCategories.find((category) => category.id === item.major_category_id)?.name,
    ),
  )
}

export function selectDutyTableGroups(data: MasterFeatureData, query: string) {
  const filteredDuties = selectFilteredDuties(data, query)
  const filteredMajorCategories = data.dutyMajorCategories
    .filter((category) => {
      if (!query.trim()) return true
      if (selectMasterSearchMatches(query, category.name)) return true
      return data.duties.some(
        (duty) => duty.major_category_id === category.id && filteredDuties.some((item) => item.id === duty.id),
      )
    })
    .sort(compareMajorCategories)

  return filteredMajorCategories.map((category) => ({
    category,
    duties: data.duties
      .filter((duty) => duty.major_category_id === category.id)
      .filter(
        (duty) =>
          !query.trim() ||
          selectMasterSearchMatches(query, category.name) ||
          filteredDuties.some((item) => item.id === duty.id),
      )
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

function productAssignmentsOf(
  data: MasterFeatureData,
  productId: string,
  assignmentsByProduct?: ProductAssignmentsByProduct,
) {
  if (assignmentsByProduct) return assignmentsByProduct.get(productId) ?? []
  return data.productAssignments.filter((assignment) => assignment.product_id === productId)
}

/** assignmentsByProduct를 넘기면 제품마다 전체 배정을 훑지 않는다(결과는 같다). */
export function selectProductGroups(
  data: MasterFeatureData,
  query: string,
  assignmentsByProduct?: ProductAssignmentsByProduct,
) {
  const filteredProducts = selectFilteredProducts(data, query)
  return {
    ownCompanyProducts: filteredProducts
      .filter((product) => (product.category ?? '자사') !== '위탁')
      .sort(compareMasterProducts),
    consignedProducts: filteredProducts.filter((product) => product.category === '위탁').sort(compareMasterProducts),
    unassignedProducts: data.products.filter(
      (product) => productAssignmentsOf(data, product.id, assignmentsByProduct).length === 0,
    ),
    unassignedDuties: data.duties.filter(
      (duty) => !duty.assignee_label && !data.dutyAssignments.some((assignment) => assignment.duty_id === duty.id),
    ),
  }
}

/** 제품 목록 위 칩: 전체 · 담당자 없음 · 비활성 담당. 홈 안내에서 ‘unassigned’로 바로 들어온다. */
export type ProductAssigneeFilter = 'all' | 'unassigned' | 'inactive'

export function isProductAssigneeFilter(value: unknown): value is ProductAssigneeFilter {
  return value === 'all' || value === 'unassigned' || value === 'inactive'
}

export function productAssigneeState(
  data: MasterFeatureData,
  productId: string,
  assignmentsByProduct?: ProductAssignmentsByProduct,
): Exclude<ProductAssigneeFilter, 'all'> | 'assigned' {
  const assignments = productAssignmentsOf(data, productId, assignmentsByProduct)
  if (assignments.length === 0) return 'unassigned'
  const hasInactive = assignments.some(
    (assignment) => data.profiles.find((profile) => profile.id === assignment.user_id)?.is_active === false,
  )
  return hasInactive ? 'inactive' : 'assigned'
}

export function matchesProductAssigneeFilter(
  data: MasterFeatureData,
  productId: string,
  filter: ProductAssigneeFilter,
  assignmentsByProduct?: ProductAssignmentsByProduct,
) {
  if (filter === 'all') return true
  return productAssigneeState(data, productId, assignmentsByProduct) === filter
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
  return data.allowedUsers.filter((item) =>
    selectMasterSearchMatches(query, item.name, item.email, item.role, roleLabels[item.role]),
  )
}
