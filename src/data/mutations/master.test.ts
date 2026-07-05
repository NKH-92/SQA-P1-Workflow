import { describe, expect, it } from 'vitest'
import { assignProduct, saveDutyAssignments, saveProductAssignments } from './master'
import type { RepositoryContext } from '../repositoryContext'
import type { AppData, Product, Profile } from '../../types'

describe('saveProductAssignments (demo)', () => {
  it('replaces product member assignments in local state', async () => {
    const leader: Profile = {
      id: 'leader-1',
      email: 'leader@example.com',
      name: 'Leader',
      role: 'leader',
    }
    const memberA: Profile = {
      id: 'member-a',
      email: 'a@example.com',
      name: 'Member A',
      role: 'member',
    }
    const memberB: Profile = {
      id: 'member-b',
      email: 'b@example.com',
      name: 'Member B',
      role: 'member',
    }
    const product: Product = {
      id: 'product-1',
      name: 'Test Product',
      category: '자사',
      company_name: '자사',
      sort_order: 1,
    }
    const data: AppData = {
      profiles: [leader, memberA, memberB],
      allowedUsers: [],
      products: [product],
      duties: [],
      dutyMajorCategories: [],
      productAssignments: [
        {
          id: 'assignment-a',
          user_id: memberA.id,
          product_id: product.id,
          profiles: { name: memberA.name, email: memberA.email },
          products: {
            name: product.name,
            category: product.category,
            company_name: product.company_name,
            sort_order: product.sort_order,
          },
        },
      ],
      dutyAssignments: [],
      reviewRequests: [],
      projects: [],
      projectAssignments: [],
      profileNotes: [],
      activityLogs: [],
    }

    let nextData = data
    const setData: RepositoryContext['setData'] = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await saveProductAssignments(
      { isRemote: false, profile: leader, data, setData },
      {
        productId: product.id,
        nextMemberIds: [memberB.id],
        product,
        memberOptions: [memberA, memberB],
      },
    )

    const assigned = nextData.productAssignments.filter((item) => item.product_id === product.id)
    expect(assigned).toHaveLength(1)
    expect(assigned[0]?.user_id).toBe(memberB.id)
  })
})

describe('saveDutyAssignments (demo)', () => {
  it('replaces duty member assignments in local state', async () => {
    const leader: Profile = {
      id: 'leader-1',
      email: 'leader@example.com',
      name: 'Leader',
      role: 'leader',
    }
    const memberA: Profile = {
      id: 'member-a',
      email: 'a@example.com',
      name: 'Member A',
      role: 'member',
    }
    const memberB: Profile = {
      id: 'member-b',
      email: 'b@example.com',
      name: 'Member B',
      role: 'member',
    }
    const data: AppData = {
      profiles: [leader, memberA, memberB],
      allowedUsers: [],
      products: [],
      duties: [
        {
          id: 'duty-1',
          name: 'Test Duty',
          major_category_id: 'major-1',
          sort_order: 1,
          duty_major_categories: { name: '미분류', sort_order: 1 },
        },
      ],
      dutyMajorCategories: [{ id: 'major-1', name: '미분류', sort_order: 1 }],
      productAssignments: [],
      dutyAssignments: [
        {
          id: 'assignment-a',
          user_id: memberA.id,
          duty_id: 'duty-1',
          profiles: { name: memberA.name, email: memberA.email },
          duties: {
            name: 'Test Duty',
            major_category_id: 'major-1',
            duty_major_categories: { name: '미분류' },
          },
        },
      ],
      reviewRequests: [],
      projects: [],
      projectAssignments: [],
      profileNotes: [],
      activityLogs: [],
    }

    let nextData = data
    const setData: RepositoryContext['setData'] = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await saveDutyAssignments(
      { isRemote: false, profile: leader, data, setData },
      {
        dutyId: 'duty-1',
        nextMemberIds: [memberB.id],
        memberOptions: [memberA, memberB],
      },
    )

    const assigned = nextData.dutyAssignments.filter((item) => item.duty_id === 'duty-1')
    expect(assigned).toHaveLength(1)
    expect(assigned[0]?.user_id).toBe(memberB.id)
  })
})

describe('assignProduct (demo)', () => {
  it('appends a product assignment in local state', async () => {
    const leader: Profile = {
      id: 'leader-1',
      email: 'leader@example.com',
      name: 'Leader',
      role: 'leader',
    }
    const member: Profile = {
      id: 'member-1',
      email: 'member@example.com',
      name: 'Member',
      role: 'member',
    }
    const product: Product = {
      id: 'product-1',
      name: 'Demo Product',
      category: '자사',
      company_name: '자사',
      sort_order: 1,
    }
    const data: AppData = {
      profiles: [leader, member],
      allowedUsers: [],
      products: [product],
      duties: [],
      dutyMajorCategories: [],
      productAssignments: [],
      dutyAssignments: [],
      reviewRequests: [],
      projects: [],
      projectAssignments: [],
      profileNotes: [],
      activityLogs: [],
    }

    let nextData = data
    const setData: RepositoryContext['setData'] = (updater) => {
      nextData = typeof updater === 'function' ? updater(nextData) : updater
    }

    await assignProduct(
      { isRemote: false, profile: leader, data, setData },
      { userId: member.id, productId: product.id },
    )

    expect(nextData.productAssignments).toHaveLength(1)
    expect(nextData.productAssignments[0]?.user_id).toBe(member.id)
  })
})
