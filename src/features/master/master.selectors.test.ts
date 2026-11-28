import { describe, expect, it } from 'vitest'
import { createPreviewData } from '../../demoData'
import {
  filterMasterProducts,
  groupProductAssignments,
  selectDutyTableGroups,
  selectProductAssigneeStatuses,
  selectProductGroups,
} from './master.selectors'

describe('master.selectors', () => {
  const data = createPreviewData()

  it('builds duty table groups from major categories', () => {
    const groups = selectDutyTableGroups(data)
    expect(groups.length).toBe(data.dutyMajorCategories.length)
    expect(groups[0].duties.length).toBeGreaterThan(0)
  })

  it('sorts products once by explicit order and numeric name and searches the sorted groups', () => {
    const products = [
      { id: '10', name: '제품 10' },
      { id: '2', name: '제품 2', unassigned_reason: '확인 필요' },
      { id: 'first', name: '제품 20', sort_order: 1 },
      { id: 'outsource', name: '제품 100', category: '위탁', company_name: 'Vendor A' },
    ]
    const { ownCompanyProducts, consignedProducts } = selectProductGroups(products)
    expect(ownCompanyProducts.map((product) => product.id)).toEqual(['first', '2', '10'])
    expect(filterMasterProducts(ownCompanyProducts, '', 'all', new Map())).toBe(ownCompanyProducts)
    expect(filterMasterProducts(ownCompanyProducts, ' 확인 필요 ', 'all', new Map()).map((product) => product.id)).toEqual(['2'])
    expect(filterMasterProducts(consignedProducts, ' VENDOR a ', 'all', new Map()).map((product) => product.id)).toEqual(['outsource'])
  })

  it('counts and filters the same inactive and unassigned products', () => {
    const inactive = data.profiles.find((profile) =>
      profile.role === 'member' && data.productAssignments.some((assignment) => assignment.user_id === profile.id),
    )!
    const withInactiveOwner = {
      ...data,
      profiles: data.profiles.map((profile) => (profile.id === inactive.id ? { ...profile, is_active: false } : profile)),
    }
    const { products, productAssignments, profiles } = withInactiveOwner
    const grouped = groupProductAssignments(productAssignments)
    const { counts, states } = selectProductAssigneeStatuses(products, grouped, new Map(profiles.map((profile) => [profile.id, profile])))
    expect(counts.all).toBe(products.length)
    expect(counts.inactive).toBeGreaterThan(0)
    expect(counts.unassigned).toBeGreaterThan(0)
    const inactiveProducts = products.filter((product) =>
      productAssignments.some((assignment) => assignment.product_id === product.id && assignment.user_id === inactive.id),
    )
    const unassignedProducts = products.filter((product) => !grouped.has(product.id))
    expect(counts.inactive).toBe(inactiveProducts.length)
    expect(counts.unassigned).toBe(unassignedProducts.length)
    expect(filterMasterProducts(products, '', 'inactive', states)).toEqual(inactiveProducts)
    expect(filterMasterProducts(products, unassignedProducts[0].name, 'unassigned', states)).toContain(unassignedProducts[0])
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
