import { describe, expect, it } from 'vitest'
import { createPreviewData } from '../../demoData'
import { selectDutyTableGroups, selectProductGroups } from './master.selectors'

describe('master.selectors', () => {
  const data = createPreviewData()

  it('builds duty table groups from major categories', () => {
    const groups = selectDutyTableGroups(data, '')
    expect(groups.length).toBe(data.dutyMajorCategories.length)
    expect(groups[0].duties.length).toBeGreaterThan(0)
  })

  it('filters product groups by query', () => {
    const all = selectProductGroups(data, '')
    const filtered = selectProductGroups(data, '자사제품 A')
    expect(filtered.ownCompanyProducts.length).toBeLessThanOrEqual(all.ownCompanyProducts.length)
  })
})
