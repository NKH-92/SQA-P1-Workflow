import { makeId } from '../../lib/format'
import type {
  AppData,
  DutyMajorCategory,
  Product,
  Profile,
  Project,
  ProjectAssignment,
  ProjectStatus,
  ReviewFeedback,
  ReviewRequest,
  ReviewStatus,
  Role,
} from '../../types'

export type ReviewRequestPayload = {
  title: string
  description: string
  attachment_url: string | null
  due_date: string | null
}

export type ProjectInput = {
  name: string
  description: string
  deadline: string | null
  status: ProjectStatus
}

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

export function createReviewRequest(
  data: AppData,
  profile: Profile,
  reviewId: string,
  payload: ReviewRequestPayload,
): AppData {
  const request: ReviewRequest = {
    id: reviewId,
    requester_id: profile.id,
    title: payload.title,
    description: payload.description,
    attachment_url: payload.attachment_url,
    due_date: payload.due_date,
    status: 'pending',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    profiles: { name: profile.name, email: profile.email },
    review_feedback: [],
  }
  return { ...data, reviewRequests: [request, ...data.reviewRequests] }
}

export function updateReviewRequest(
  data: AppData,
  reviewId: string,
  payload: ReviewRequestPayload,
): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((request) =>
      request.id === reviewId
        ? { ...request, ...payload, updated_at: new Date().toISOString() }
        : request,
    ),
  }
}

export function removeReviewRequest(data: AppData, requestId: string): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.filter((item) => item.id !== requestId),
  }
}

export function rejectReviewRequest(
  data: AppData,
  requestId: string,
  profile: Profile,
  comment: string,
  feedbackId: string,
): AppData {
  const item: ReviewFeedback = {
    id: feedbackId,
    review_request_id: requestId,
    leader_id: profile.id,
    comment,
    created_at: new Date().toISOString(),
    profiles: { name: profile.name },
  }
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? { ...row, status: 'rejected', review_feedback: [...(row.review_feedback ?? []), item] }
        : row,
    ),
  }
}

export function setReviewStatus(data: AppData, requestId: string, status: ReviewStatus): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId ? { ...row, status, updated_at: new Date().toISOString() } : row,
    ),
  }
}

export function appendReviewFeedback(
  data: AppData,
  requestId: string,
  feedback: ReviewFeedback,
): AppData {
  return {
    ...data,
    reviewRequests: data.reviewRequests.map((row) =>
      row.id === requestId
        ? { ...row, review_feedback: [...(row.review_feedback ?? []), feedback] }
        : row,
    ),
  }
}

export function addProject(data: AppData, profile: Profile, projectId: string, project: ProjectInput): AppData {
  return {
    ...data,
    projects: [
      {
        id: projectId,
        name: project.name,
        description: project.description,
        deadline: project.deadline,
        status: project.status,
        created_by: profile.id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      ...data.projects,
    ],
  }
}

export function updateProject(data: AppData, projectId: string, updated: ProjectInput): AppData {
  return {
    ...data,
    projects: data.projects.map((item) =>
      item.id === projectId ? { ...item, ...updated, updated_at: new Date().toISOString() } : item,
    ),
    projectAssignments: data.projectAssignments.map((assignment) =>
      assignment.project_id === projectId
        ? {
            ...assignment,
            projects: {
              name: updated.name,
              description: updated.description,
              deadline: updated.deadline,
              status: updated.status,
            },
          }
        : assignment,
    ),
  }
}

export function removeProject(data: AppData, projectId: string): AppData {
  return {
    ...data,
    projects: data.projects.filter((item) => item.id !== projectId),
    projectAssignments: data.projectAssignments.filter((assignment) => assignment.project_id !== projectId),
  }
}

export function replaceProjectAssignments(
  data: AppData,
  project: Project,
  nextMemberIds: string[],
  memberOptions: Profile[],
): AppData {
  const currentIds = data.projectAssignments
    .filter((assignment) => assignment.project_id === project.id)
    .map((assignment) => assignment.user_id)
  const toAdd = nextMemberIds.filter((id) => !currentIds.includes(id))
  const toRemove = data.projectAssignments.filter(
    (assignment) => assignment.project_id === project.id && !nextMemberIds.includes(assignment.user_id),
  )

  return {
    ...data,
    projectAssignments: [
      ...data.projectAssignments.filter((assignment) => !toRemove.some((item) => item.id === assignment.id)),
      ...toAdd.map((memberId) => {
        const member = memberOptions.find((item) => item.id === memberId)
        return {
          id: makeId('project-assignment'),
          project_id: project.id,
          user_id: memberId,
          notes: null,
          created_at: new Date().toISOString(),
          profiles: member ? { name: member.name, email: member.email } : null,
          projects: {
            name: project.name,
            description: project.description,
            deadline: project.deadline,
            status: project.status,
          },
        } satisfies ProjectAssignment
      }),
    ],
  }
}

export function addProduct(data: AppData, product: Product): AppData {
  return { ...data, products: [product, ...data.products] }
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

export function removeProductAssignment(data: AppData, assignmentId: string): AppData {
  return {
    ...data,
    productAssignments: data.productAssignments.filter((item) => item.id !== assignmentId),
  }
}

export function replaceProductAssignments(
  data: AppData,
  productId: string,
  nextMemberIds: string[],
  product: Product | null,
  memberOptions: Array<{ id: string; name: string; email: string }>,
): AppData {
  const currentIds = data.productAssignments
    .filter((assignment) => assignment.product_id === productId)
    .map((assignment) => assignment.user_id)
  const toAdd = nextMemberIds.filter((id) => !currentIds.includes(id))
  const toRemove = data.productAssignments.filter(
    (assignment) => assignment.product_id === productId && !nextMemberIds.includes(assignment.user_id),
  )

  return {
    ...data,
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

export function removeDutyAssignment(data: AppData, assignmentId: string): AppData {
  return {
    ...data,
    dutyAssignments: data.dutyAssignments.filter((item) => item.id !== assignmentId),
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
  const currentIds = data.dutyAssignments
    .filter((assignment) => assignment.duty_id === dutyId)
    .map((assignment) => assignment.user_id)
  const toAdd = nextMemberIds.filter((id) => !currentIds.includes(id))
  const toRemove = data.dutyAssignments.filter(
    (assignment) => assignment.duty_id === dutyId && !nextMemberIds.includes(assignment.user_id),
  )

  return {
    ...data,
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

export function addAllowedUserLocal(
  data: AppData,
  input: { id: string; email: string; name: string; role: Role; created_at: string },
): AppData {
  return {
    ...data,
    allowedUsers: [input, ...data.allowedUsers],
    profiles: [
      { id: makeId('profile'), email: input.email, name: input.name, role: input.role },
      ...data.profiles,
    ],
  }
}

export function updateAllowedUser(
  data: AppData,
  inviteId: string,
  payload: { email: string; name: string; role: Role },
): AppData {
  return {
    ...data,
    allowedUsers: data.allowedUsers.map((item) => (item.id === inviteId ? { ...item, ...payload } : item)),
  }
}

export function setProfileActive(data: AppData, profileId: string, nextActive: boolean): AppData {
  return {
    ...data,
    profiles: data.profiles.map((item) => (item.id === profileId ? { ...item, is_active: nextActive } : item)),
  }
}

export function newId(prefix: string): string {
  return makeId(prefix)
}
