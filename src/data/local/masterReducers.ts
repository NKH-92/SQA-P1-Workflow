import { makeId } from '../../lib/format'
import type { AppData, DutyMajorCategory, Product, Profile } from '../../types'

function productRelation(product: Product) {
  return {
    name: product.name,
    category: product.category,
    company_name: product.company_name,
    sort_order: product.sort_order,
  }
}

function dutyRelation(duty: {
  name: string
  major_category_id: string
  duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
}) {
  return {
    name: duty.name,
    major_category_id: duty.major_category_id,
    duty_major_categories: duty.duty_major_categories ?? null,
  }
}

export function updateProductRow(
  data: AppData,
  productId: string,
  payload: Partial<Product>,
): AppData {
  return {
    ...data,
    products: data.products.map((item) => (item.id === productId ? { ...item, ...payload } : item)),
    productAssignments: data.productAssignments.map((assignment) =>
      assignment.product_id === productId
        ? {
            ...assignment,
            products: assignment.products
              ? { ...assignment.products, ...payload }
              : null,
          }
        : assignment,
    ),
  }
}

export function removeProduct(data: AppData, productId: string): AppData {
  return {
    ...data,
    products: data.products.filter((item) => item.id !== productId),
    productAssignments: data.productAssignments.filter((item) => item.product_id !== productId),
  }
}

export function replaceProductAssignments(
  data: AppData,
  productId: string,
  nextMemberIds: string[],
  product: Product | null,
  memberOptions: Array<{ id: string; name: string; email: string }>,
  unassignedReason: string | null = null,
): AppData {
  const desiredIds = [...new Set(nextMemberIds)]
  const currentIds = data.productAssignments
    .filter((assignment) => assignment.product_id === productId)
    .map((assignment) => assignment.user_id)
  const toAdd = desiredIds.filter((id) => !currentIds.includes(id))
  const toRemove = data.productAssignments.filter(
    (assignment) => assignment.product_id === productId && !desiredIds.includes(assignment.user_id),
  )

  return {
    ...data,
    // Always bump the parent revision, mirroring
    // replace_product_assignments_if_current, so a second editor holding the
    // pre-save snapshot fails on their next stale-checked save.
    products: data.products.map((item) =>
      item.id === productId
        ? {
            ...item,
            unassigned_reason: desiredIds.length === 0 ? unassignedReason?.trim() || null : null,
            updated_at: new Date().toISOString(),
          }
        : item,
    ),
    productAssignments: [
      ...data.productAssignments.filter((assignment) => !toRemove.some((item) => item.id === assignment.id)),
      ...toAdd.map((memberId) => {
        const member = memberOptions.find((item) => item.id === memberId)
        return {
          id: makeId('product-assignment'),
          user_id: memberId,
          product_id: productId,
          profiles: member ? { name: member.name, email: member.email } : null,
          products: product ? productRelation(product) : null,
        }
      }),
    ],
  }
}

export function appendProductAssignment(
  data: AppData,
  userId: string,
  productId: string,
  member: Profile | undefined,
  product: Product | undefined,
): AppData {
  return {
    ...data,
    products: data.products.map((item) =>
      item.id === productId ? { ...item, unassigned_reason: null } : item,
    ),
    productAssignments: [
      {
        id: makeId('product-assignment'),
        user_id: userId,
        product_id: productId,
        profiles: member ? { name: member.name, email: member.email } : null,
        products: product ? productRelation(product) : null,
      },
      ...data.productAssignments,
    ],
  }
}

export function removeDuty(data: AppData, dutyId: string): AppData {
  return {
    ...data,
    duties: data.duties.filter((item) => item.id !== dutyId),
    dutyAssignments: data.dutyAssignments.filter((item) => item.duty_id !== dutyId),
  }
}

export function removeDutyMajorCategory(data: AppData, majorCategoryId: string): AppData {
  return {
    ...data,
    dutyMajorCategories: data.dutyMajorCategories.filter((item) => item.id !== majorCategoryId),
  }
}

export function removeAllowedUser(data: AppData, id: string): AppData {
  return {
    ...data,
    allowedUsers: data.allowedUsers.filter((item) => item.id !== id),
  }
}

export function replaceDutyAssignments(
  data: AppData,
  dutyId: string,
  nextMemberIds: string[],
  duty: {
    name: string
    major_category_id: string
    duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
  } | null,
  memberOptions: Array<{ id: string; name: string; email: string }>,
): AppData {
  const desiredIds = [...new Set(nextMemberIds)]
  const currentIds = data.dutyAssignments
    .filter((assignment) => assignment.duty_id === dutyId)
    .map((assignment) => assignment.user_id)
  const toAdd = desiredIds.filter((id) => !currentIds.includes(id))
  const toRemove = data.dutyAssignments.filter(
    (assignment) => assignment.duty_id === dutyId && !desiredIds.includes(assignment.user_id),
  )

  return {
    ...data,
    // Always bump the parent revision, mirroring
    // replace_duty_assignments_if_current.
    duties: data.duties.map((item) =>
      item.id === dutyId ? { ...item, updated_at: new Date().toISOString() } : item,
    ),
    dutyAssignments: [
      ...data.dutyAssignments.filter((assignment) => !toRemove.some((item) => item.id === assignment.id)),
      ...toAdd.map((memberId) => {
        const member = memberOptions.find((item) => item.id === memberId)
        return {
          id: makeId('duty-assignment'),
          user_id: memberId,
          duty_id: dutyId,
          profiles: member ? { name: member.name, email: member.email } : null,
          duties: duty ? dutyRelation(duty) : null,
        }
      }),
    ],
  }
}

export function appendDutyAssignment(
  data: AppData,
  userId: string,
  dutyId: string,
  member: Profile | undefined,
  duty: ReturnType<typeof dutyRelation> | null,
): AppData {
  return {
    ...data,
    dutyAssignments: [
      {
        id: makeId('duty-assignment'),
        user_id: userId,
        duty_id: dutyId,
        profiles: member ? { name: member.name, email: member.email } : null,
        duties: duty,
      },
      ...data.dutyAssignments,
    ],
  }
}
