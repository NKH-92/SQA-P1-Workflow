import type { AppData, Duty, DutyMajorCategory } from '../../types'

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

function selectFilteredProducts(data: AppData, query: string) {
  return data.products.filter((item) => selectMasterSearchMatches(query, item.name, item.category, item.company_name))
}

function selectFilteredDuties(data: AppData, query: string) {
  return data.duties.filter((item) =>
    selectMasterSearchMatches(
      query,
      item.name,
      item.duty_major_categories?.name,
      data.dutyMajorCategories.find((category) => category.id === item.major_category_id)?.name,
    ),
  )
}

export function selectDutyTableGroups(data: AppData, query: string) {
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

export function selectProductGroups(data: AppData, query: string) {
  const filteredProducts = selectFilteredProducts(data, query)
  return {
    ownCompanyProducts: filteredProducts
      .filter((product) => (product.category ?? '자사') !== '위탁')
      .sort(compareMasterProducts),
    consignedProducts: filteredProducts.filter((product) => product.category === '위탁').sort(compareMasterProducts),
    unassignedProducts: data.products.filter(
      (product) => !data.productAssignments.some((assignment) => assignment.product_id === product.id),
    ),
    unassignedDuties: data.duties.filter(
      (duty) => !duty.assignee_label && !data.dutyAssignments.some((assignment) => assignment.duty_id === duty.id),
    ),
  }
}

export function selectFilteredAllowedUsers(data: AppData, query: string) {
  return data.allowedUsers.filter((item) =>
    selectMasterSearchMatches(query, item.name, item.email, item.role),
  )
}
