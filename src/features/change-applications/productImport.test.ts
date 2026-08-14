import { describe, expect, it } from 'vitest'
import type { ChangeScopeProduct } from './selectors'
import {
  matchImportedProductNames,
  normalizeProductMatchName,
  uniqueResolvedProductIds,
} from './productImport'
import { extractImportedProductNames } from './productImportFile'

const products: ChangeScopeProduct[] = [
  { id: 'a', name: '테스트정 500mg', category: '자사', companyName: null, sortOrder: 1, assignees: [] },
  { id: 'b', name: '알파 캡슐(10mg)', category: '자사', companyName: null, sortOrder: 2, assignees: [] },
  { id: 'c', name: '충돌정 5mg', category: '자사', companyName: null, sortOrder: 3, assignees: [] },
  { id: 'd', name: '충돌정5밀리그램', category: '위탁', companyName: null, sortOrder: 4, assignees: [] },
]

describe('change application product import', () => {
  it('normalizes spacing, display brackets and common Korean dosage units conservatively', () => {
    expect(normalizeProductMatchName(' 알파 캡슐 ( 10 밀리그램 ) ')).toBe('알파캡슐10mg')
    expect(normalizeProductMatchName('테스트정 500㎎')).toBe('테스트정500mg')
    expect(normalizeProductMatchName('주사액 0.5 밀리리터')).toBe('주사액0.5ml')
  })

  it('prefers one exact master match before normalized matching and flags collisions', () => {
    const result = matchImportedProductNames([
      { rowNumber: 2, name: '테스트정 500mg' },
      { rowNumber: 3, name: '알파캡슐 10밀리그램' },
      { rowNumber: 4, name: '충돌정 5 밀리그램' },
      { rowNumber: 5, name: '없는제품' },
    ], products)

    expect(result.map(({ status }) => status)).toEqual(['exact', 'normalized', 'ambiguous', 'unmatched'])
    expect(result[0].productId).toBe('a')
    expect(result[1].productId).toBe('b')
    expect(result[2].candidateProductIds).toEqual(['c', 'd'])
  })

  it('marks repeated rows and deduplicates resolved product ids', () => {
    const result = matchImportedProductNames([
      { rowNumber: 2, name: '테스트정 500mg' },
      { rowNumber: 3, name: '테스트정500밀리그램' },
    ], products)

    expect(result[1]).toMatchObject({ status: 'duplicate', productId: 'a', duplicateOfRowNumber: 2 })
    expect(uniqueResolvedProductIds(result)).toEqual(['a'])
  })

  it('extracts the product column from the requested template header', () => {
    expect(extractImportedProductNames([
      ['메모', '제품명'],
      ['첫 번째', '테스트정 500mg'],
      ['', ''],
      ['두 번째', '알파 캡슐'],
    ])).toEqual([
      { rowNumber: 2, name: '테스트정 500mg' },
      { rowNumber: 4, name: '알파 캡슐' },
    ])
  })

  it('accepts a headerless single column and rejects ambiguous columns', () => {
    expect(extractImportedProductNames([['제품A'], ['제품B']])).toEqual([
      { rowNumber: 1, name: '제품A' },
      { rowNumber: 2, name: '제품B' },
    ])
    expect(() => extractImportedProductNames([['제품A', '메모']])).toThrow('제품명 한 열')
  })
})
