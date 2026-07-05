import type { AppData, Product } from '../types'

export type ProductAllocationCsvRow = {
  구분: string
  제품명: string
  담당자명: string
  위탁사명: string
}

function productSortValue(product: Product) {
  return product.sort_order ?? Number.MAX_SAFE_INTEGER
}

function productCategory(product: Product) {
  return product.category?.trim() || '자사'
}

function productCompanyName(product: Product) {
  return product.company_name?.trim() || (productCategory(product) === '자사' ? '자사' : '')
}

function productMeta(product: Product) {
  return {
    구분: productCategory(product),
    제품명: product.name,
    위탁사명: productCompanyName(product),
  }
}

export function buildProductAllocationCsvRows(data: AppData): ProductAllocationCsvRow[] {
  const assignmentsByProduct = new Map<string, AppData['productAssignments']>()
  data.productAssignments.forEach((assignment) => {
    const assignments = assignmentsByProduct.get(assignment.product_id) ?? []
    assignments.push(assignment)
    assignmentsByProduct.set(assignment.product_id, assignments)
  })

  return [...data.products]
    .sort((left, right) => productSortValue(left) - productSortValue(right) || left.name.localeCompare(right.name))
    .flatMap((product) => {
      const assignments = assignmentsByProduct.get(product.id) ?? []
      const base = productMeta(product)

      if (assignments.length === 0) {
        return [{ 구분: base.구분, 제품명: base.제품명, 담당자명: '', 위탁사명: base.위탁사명 }]
      }

      return assignments.map((assignment) => ({
        구분: base.구분,
        제품명: base.제품명,
        담당자명:
          assignment.profiles?.name ??
          data.profiles.find((member) => member.id === assignment.user_id)?.name ??
          '',
        위탁사명: base.위탁사명,
      }))
    })
}
