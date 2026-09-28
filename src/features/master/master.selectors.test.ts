import { describe, expect, it } from 'vitest'
import { createPreviewData } from '../../demoData'
import {
  groupProductAssignments,
  matchesProductAssigneeFilter,
  productAssigneeState,
  selectDutyTableGroups,
  selectProductGroups,
} from './master.selectors'

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

  it('gives the same product groups and owner states with the grouped assignment map', () => {
    const inactive = data.profiles.find((profile) =>
      profile.role === 'member' && data.productAssignments.some((assignment) => assignment.user_id === profile.id),
    )!
    const withInactiveOwner = {
      ...data,
      profiles: data.profiles.map((profile) => (profile.id === inactive.id ? { ...profile, is_active: false } : profile)),
    }
    const grouped = groupProductAssignments(withInactiveOwner.productAssignments)
    expect(selectProductGroups(withInactiveOwner, '', grouped)).toEqual(selectProductGroups(withInactiveOwner, ''))
    const states = withInactiveOwner.products.map((product) => productAssigneeState(withInactiveOwner, product.id))
    expect(withInactiveOwner.products.map((product) => productAssigneeState(withInactiveOwner, product.id, grouped)))
      .toEqual(states)
    expect(states).toEqual(expect.arrayContaining(['unassigned', 'inactive']))
    for (const filter of ['all', 'unassigned', 'inactive'] as const) {
      for (const product of withInactiveOwner.products) {
        expect(matchesProductAssigneeFilter(withInactiveOwner, product.id, filter, grouped))
          .toBe(matchesProductAssigneeFilter(withInactiveOwner, product.id, filter))
      }
    }
  })

  it('groups product assignments by product in source order', () => {
    const grouped = groupProductAssignments(data.productAssignments)
    for (const product of data.products) {
      expect(grouped.get(product.id) ?? []).toEqual(
        data.productAssignments.filter((assignment) => assignment.product_id === product.id),
      )
    }
  })
})
