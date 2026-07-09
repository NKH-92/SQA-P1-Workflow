import type { AppData } from '../types'

/**
 * 제품 배정 표시·정렬 규칙의 단일 출처.
 * TeamPanel·MyWorkPanel·Dashboard가 같은 사람의 제품 목록을 서로 다르게
 * 정렬·표기하지 않도록 여기서만 정의한다.
 */
export type ProductAssignment = AppData['productAssignments'][number]

export type ProductSortKey = 'source' | 'name' | 'company'

export function productName(assignment: ProductAssignment) {
  return assignment.products?.name ?? assignment.product_id
}

export function productCategory(assignment: ProductAssignment): '자사' | '위탁' {
  return assignment.products?.category === '위탁' ? '위탁' : '자사'
}

/** 표시용 회사명. 자사 제품의 '자사' 센티널은 비워 배지·열 제목과의 중복 라벨을 막는다. */
export function productCompanyName(assignment: ProductAssignment) {
  const companyName = assignment.products?.company_name?.trim() ?? ''
  if (productCategory(assignment) === '위탁') return companyName
  return companyName && companyName !== '자사' ? companyName : ''
}

function productSortValue(assignment: ProductAssignment) {
  return assignment.products?.sort_order ?? Number.MAX_SAFE_INTEGER
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, 'ko-KR', { numeric: true, sensitivity: 'base' })
}

export function compareProducts(left: ProductAssignment, right: ProductAssignment, sortKey: ProductSortKey = 'source') {
  if (sortKey === 'source') {
    return productSortValue(left) - productSortValue(right) || compareText(productName(left), productName(right))
  }
  if (sortKey === 'company') {
    return compareText(productCompanyName(left), productCompanyName(right)) || compareText(productName(left), productName(right))
  }
  return compareText(productName(left), productName(right))
}
