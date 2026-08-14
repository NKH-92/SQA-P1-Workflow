import type { ChangeScopeProduct } from './selectors'

export const MAX_CHANGE_PRODUCT_IMPORT_BYTES = 2 * 1024 * 1024
export const MAX_CHANGE_PRODUCT_IMPORT_ROWS = 1000

export type ImportedProductNameRow = {
  rowNumber: number
  name: string
}

export type ProductImportMatchStatus =
  | 'exact'
  | 'normalized'
  | 'ambiguous'
  | 'unmatched'
  | 'duplicate'

export type ProductImportMatch = ImportedProductNameRow & {
  normalizedName: string
  status: ProductImportMatchStatus
  productId: string | null
  candidateProductIds: string[]
  duplicateOfRowNumber: number | null
}

function normalizeExactName(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ko')
}

/**
 * 제품 마스터를 바꾸지 않고 가져오기 시점에만 사용하는 보수적인 비교 키다.
 * 공백·표시용 괄호와 흔한 의약품 단위 표기만 보정하고 숫자와 제품명 본문은 보존한다.
 */
export function normalizeProductMatchName(value: string) {
  return normalizeExactName(value)
    .replace(/마이크로그램|mcg|[μµ]g/giu, 'mcg')
    .replace(/밀리그램|mg/giu, 'mg')
    .replace(/밀리리터|ml/giu, 'ml')
    .replace(/그램|gram|gr/giu, 'g')
    .replace(/[\s()[\]{}（）［］｛｝]/gu, '')
}

function productIdsByKey(
  products: ChangeScopeProduct[],
  keyFor: (name: string) => string,
) {
  const indexes = new Map<string, string[]>()
  for (const product of products) {
    const key = keyFor(product.name)
    const ids = indexes.get(key) ?? []
    ids.push(product.id)
    indexes.set(key, ids)
  }
  return indexes
}

export function matchImportedProductNames(
  rows: ImportedProductNameRow[],
  products: ChangeScopeProduct[],
): ProductImportMatch[] {
  const exactIndexes = productIdsByKey(products, normalizeExactName)
  const normalizedIndexes = productIdsByKey(products, normalizeProductMatchName)
  const firstResolvedRow = new Map<string, number>()

  return rows.map((row) => {
    const normalizedName = normalizeProductMatchName(row.name)
    const exactCandidates = exactIndexes.get(normalizeExactName(row.name)) ?? []
    const normalizedCandidates = normalizedIndexes.get(normalizedName) ?? []
    const candidates = exactCandidates.length > 0 ? exactCandidates : normalizedCandidates

    if (candidates.length === 1) {
      const productId = candidates[0]
      const duplicateOfRowNumber = firstResolvedRow.get(productId) ?? null
      if (duplicateOfRowNumber != null) {
        return {
          ...row,
          normalizedName,
          status: 'duplicate' as const,
          productId,
          candidateProductIds: candidates,
          duplicateOfRowNumber,
        }
      }
      firstResolvedRow.set(productId, row.rowNumber)
      return {
        ...row,
        normalizedName,
        status: exactCandidates.length === 1 ? 'exact' as const : 'normalized' as const,
        productId,
        candidateProductIds: candidates,
        duplicateOfRowNumber: null,
      }
    }

    return {
      ...row,
      normalizedName,
      status: candidates.length > 1 ? 'ambiguous' as const : 'unmatched' as const,
      productId: null,
      candidateProductIds: candidates,
      duplicateOfRowNumber: null,
    }
  })
}

export function uniqueResolvedProductIds(matches: ProductImportMatch[]) {
  const ids = new Set<string>()
  for (const match of matches) {
    if (match.productId) ids.add(match.productId)
  }
  return [...ids]
}
