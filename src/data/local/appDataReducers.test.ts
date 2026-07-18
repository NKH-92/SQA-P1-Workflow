import { describe, expect, it } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../demoData'
import {
  createReviewRequest,
  removeProduct,
  replaceProductAssignments,
  replaceDutyAssignments,
  replaceProjectAssignments,
  setReviewStatus,
  updateProject,
} from './appDataReducers'

describe('appDataReducers', () => {
  it('creates a review request in local app data', () => {
    const data = createPreviewData()
    const next = createReviewRequest(data, previewMember, 'review-new', {
      title: 'New review',
      description: 'Details',
      due_date: '2026-08-01',
    })

    expect(next.reviewRequests).toHaveLength(data.reviewRequests.length + 1)
    expect(next.reviewRequests[0]?.id).toBe('review-new')
    expect(next.reviewRequests[0]?.status).toBe('pending')
  })

  it('updates review status immutably', () => {
    const data = createPreviewData()
    const reviewId = data.reviewRequests[0]?.id
    expect(reviewId).toBeTruthy()

    const next = setReviewStatus(data, reviewId!, 'approved', previewLeader)
    expect(next.reviewRequests.find((item) => item.id === reviewId)?.status).toBe('approved')
    expect(data.reviewRequests.find((item) => item.id === reviewId)?.status).not.toBe('approved')
  })

  it('updates a project and related assignment snapshots', () => {
    const data = createPreviewData()
    const project = data.projects[0]
    expect(project).toBeTruthy()

    const next = updateProject(data, project!.id, {
      name: 'Renamed project',
      description: 'Updated',
      deadline: '2026-09-01',
      status: 'in_progress',
    })

    expect(next.projects.find((item) => item.id === project!.id)?.name).toBe('Renamed project')
    expect(
      next.projectAssignments
        .filter((item) => item.project_id === project!.id)
        .every((item) => item.projects?.name === 'Renamed project'),
    ).toBe(true)
  })

  it('replaces project assignments for selected members', () => {
    const data = createPreviewData()
    const project = data.projects[0]
    expect(project).toBeTruthy()

    const next = replaceProjectAssignments(data, project!, [previewMember.id], [previewMember])
    const assigned = next.projectAssignments.filter((item) => item.project_id === project!.id)
    expect(assigned.some((item) => item.user_id === previewMember.id)).toBe(true)
  })

  it('deduplicates assignment ids like the remote on-conflict path', () => {
    const data = createPreviewData()
    const project = data.projects[0]!
    const product = data.products[0]!
    const duty = data.duties[0]!
    const projectNext = replaceProjectAssignments(data, project, [previewMember.id, previewMember.id], [previewMember])
    const productNext = replaceProductAssignments(projectNext, product.id, [previewMember.id, previewMember.id], product, [previewMember])
    const dutyNext = replaceDutyAssignments(productNext, duty.id, [previewMember.id, previewMember.id], duty, [previewMember])

    expect(dutyNext.projectAssignments.filter((item) => item.project_id === project.id && item.user_id === previewMember.id)).toHaveLength(1)
    expect(dutyNext.productAssignments.filter((item) => item.product_id === product.id && item.user_id === previewMember.id)).toHaveLength(1)
    expect(dutyNext.dutyAssignments.filter((item) => item.duty_id === duty.id && item.user_id === previewMember.id)).toHaveLength(1)
  })

  it('keeps product unassigned reason consistent with assignment rows', () => {
    const data = createPreviewData()
    const product = data.products.find(
      (item) => !data.productAssignments.some((assignment) => assignment.product_id === item.id),
    )!

    const unassigned = replaceProductAssignments(data, product.id, [], product, [previewMember], ' 담당자 협의 중 ')
    expect(unassigned.products.find((item) => item.id === product.id)?.unassigned_reason).toBe('담당자 협의 중')

    const assigned = replaceProductAssignments(
      unassigned,
      product.id,
      [previewMember.id],
      product,
      [previewMember],
      '남아 있으면 안 됨',
    )
    expect(assigned.products.find((item) => item.id === product.id)?.unassigned_reason).toBeNull()
  })

  it('removes a product and its assignments', () => {
    const data = createPreviewData()
    const product = data.products[0]
    expect(product).toBeTruthy()

    const next = removeProduct(data, product!.id)
    expect(next.products.some((item) => item.id === product!.id)).toBe(false)
    expect(next.productAssignments.some((item) => item.product_id === product!.id)).toBe(false)
  })
})

describe('master delete activity logging (demo)', () => {
  it('records activity when deleting a product locally', async () => {
    const data = createPreviewData()
    data.productChangeTasks = []
    const product = data.products[0]
    expect(product).toBeTruthy()

    let next = data
    const { deleteProduct } = await import('../mutations/master')

    await deleteProduct(
      {
        isRemote: false,
        profile: previewLeader,
        data,
        setData: (updater) => {
          next = typeof updater === 'function' ? updater(next) : updater
        },
      },
      product!.id,
    )

    expect(next.products.some((item) => item.id === product!.id)).toBe(false)
    expect(next.activityLogs.some((log) => log.entity_type === 'product' && log.action === 'deleted')).toBe(true)
  })

  it('protects products that have retained change-application history', async () => {
    const data = createPreviewData()
    const product = data.products.find((item) =>
      data.productChangeTasks.some((task) => task.product_id === item.id),
    )!
    const { deleteProduct } = await import('../mutations/master')

    await expect(deleteProduct(
      {
        isRemote: false,
        profile: previewLeader,
        data,
        setData: () => undefined,
      },
      product.id,
    )).rejects.toThrow('변경 적용 이력이 있는 제품은 삭제할 수 없습니다')
  })

  it('records activity when deleting an allowed user locally', async () => {
    const data = createPreviewData()
    const invite = data.allowedUsers[0]
    expect(invite).toBeTruthy()

    let next = data
    const { deleteAllowedUser } = await import('../mutations/master')

    await deleteAllowedUser(
      {
        isRemote: false,
        profile: previewLeader,
        data,
        setData: (updater) => {
          next = typeof updater === 'function' ? updater(next) : updater
        },
      },
      invite!.id,
    )

    expect(next.allowedUsers.some((item) => item.id === invite!.id)).toBe(false)
    expect(next.activityLogs.some((log) => log.entity_type === 'allowed_user' && log.action === 'deleted')).toBe(true)
  })
})
