import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import type { DutyMajorCategory, Product, ProductCategory, Role } from '../../types'
import { createLocalMasterRepository } from '../local/localMasterRepository'
import { createSupabaseMasterRepository } from '../remote/supabaseMasterRepository'
import type { RepositoryContext } from '../repositoryContext'

type ProductInput = {
  name: string
  category?: ProductCategory | string
  companyName?: string
  sortOrder?: number | null
}

function normalizeUnassignedReason(value: string | null | undefined): string | null {
  const reason = value?.trim() || null
  if (reason && reason.length > 1000) {
    throw new UserFacingError('담당자 미지정 사유는 1000자 이하로 입력해 주세요.')
  }
  return reason
}

function normalizeProductInput(input: ProductInput) {
  const category = input.category?.trim() || '자사'
  return {
    name: input.name.trim(),
    category,
    company_name: input.companyName?.trim() || (category === '자사' ? '자사' : ''),
    sort_order: input.sortOrder ?? null,
  }
}

function masterRepository(ctx: RepositoryContext) {
  return ctx.isRemote ? createSupabaseMasterRepository(ctx) : createLocalMasterRepository(ctx)
}

async function logMasterActivity(
  ctx: RepositoryContext,
  entityType: Parameters<typeof recordActivityLog>[1]['entityType'],
  action: string,
  summary: string,
  entityId: string | null = null,
  metadata: Record<string, unknown> = {},
) {
  await recordActivityLog(ctx.setData, {
    actor: ctx.profile,
    entityType,
    entityId,
    action,
    summary,
    metadata,
  }, { isRemote: ctx.isRemote })
}

export async function importProducts(
  ctx: RepositoryContext,
  rows: ProductInput[],
): Promise<void> {
  const products = rows.map(normalizeProductInput)
  await masterRepository(ctx).importProducts(products)
  await logMasterActivity(ctx, 'product', 'created', `${products.length}개 제품을 가져왔습니다.`, null, {
    count: products.length,
  })
}

export async function importInvites(
  ctx: RepositoryContext,
  rows: Array<{ email: string; name: string; role: Role }>,
): Promise<void> {
  const invites = rows.map((row) => ({ ...row, name: row.name.trim() }))
  await masterRepository(ctx).importInvites(invites)
  await logMasterActivity(ctx, 'allowed_user', 'created', `${rows.length}개 초대를 가져왔습니다.`, null, {
    count: rows.length,
  })
}

export async function addAllowedUser(
  ctx: RepositoryContext,
  input: { email: string; name: string; role: Role },
): Promise<void> {
  await masterRepository(ctx).addAllowedUser(input)
  await logMasterActivity(ctx, 'allowed_user', 'created', `${input.name} 초대를 추가했습니다.`, null, {
    email: input.email,
    role: input.role,
  })
}

export async function addProduct(
  ctx: RepositoryContext,
  input: ProductInput,
): Promise<void> {
  const product = normalizeProductInput(input)
  await masterRepository(ctx).addProduct(product)
  await logMasterActivity(ctx, 'product', 'created', `${product.name} 제품을 추가했습니다.`, null, product)
}

export async function addDutyMajorCategory(
  ctx: RepositoryContext,
  input: { name: string; sortOrder?: number | null },
): Promise<void> {
  const payload = {
    name: input.name.trim(),
    sort_order: input.sortOrder ?? null,
  }
  await masterRepository(ctx).addDutyMajorCategory(payload)
  await logMasterActivity(
    ctx,
    'duty_major_category',
    'created',
    `${payload.name} 대분류를 추가했습니다.`,
    null,
    payload,
  )
}

export async function addDuty(
  ctx: RepositoryContext,
  input: { majorCategoryId: string; name: string; sortOrder?: number | null },
): Promise<void> {
  const payload = {
    major_category_id: input.majorCategoryId,
    name: input.name.trim(),
    sort_order: input.sortOrder ?? null,
  }
  await masterRepository(ctx).addDuty(payload)
  await logMasterActivity(ctx, 'duty', 'created', `${payload.name} 업무를 추가했습니다.`, null, payload)
}

export async function saveProductAssignments(
  ctx: RepositoryContext,
  input: {
    productId: string
    nextMemberIds: string[]
    unassignedReason?: string | null
    product?: Product | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
  },
): Promise<void> {
  const normalizedReason = normalizeUnassignedReason(input.unassignedReason)
  await masterRepository(ctx).saveProductAssignments({
    ...input,
    unassignedReason: normalizedReason,
  })
  await logMasterActivity(ctx, 'product_assignment', 'updated', '제품 배정을 조정했습니다.', input.productId, {
    assigned_user_ids: input.nextMemberIds,
    unassigned_reason: input.nextMemberIds.length === 0 ? normalizedReason : null,
  })
}

export async function saveDutyAssignments(
  ctx: RepositoryContext,
  input: {
    dutyId: string
    nextMemberIds: string[]
    duty?: {
      name: string
      major_category_id: string
      duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
    } | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
  },
): Promise<void> {
  await masterRepository(ctx).saveDutyAssignments(input)
  await logMasterActivity(ctx, 'duty_assignment', 'updated', '업무 배정을 조정했습니다.', input.dutyId, {
    assigned_user_ids: input.nextMemberIds,
  })
}

export async function assignProduct(
  ctx: RepositoryContext,
  input: {
    userId: string
    productId: string
    transferPendingChangeTasks?: boolean
    transferReason?: string
  },
): Promise<void> {
  const transferPending = input.transferPendingChangeTasks === true
  const transferReason = input.transferReason?.trim() || null
  const result = await masterRepository(ctx).assignProduct({
    userId: input.userId,
    productId: input.productId,
    transferPending,
    transferReason,
  })
  if (result.kind === 'noop' || result.kind === 'server-audited') return

  const activityMetadata = result.includeTransferredTaskCount
    ? { user_id: input.userId, transferred_task_count: result.transferredTasks.length }
    : { user_id: input.userId }
  await logMasterActivity(
    ctx,
    'product_assignment',
    result.action,
    transferPending ? '제품을 배정하고 미완료 변경 적용업무를 이관했습니다.' : '제품을 배정했습니다.',
    input.productId,
    activityMetadata,
  )
  for (const task of result.transferredTasks) {
    await recordActivityLog(ctx.setData, {
      actor: ctx.profile,
      targetUserId: input.userId,
      entityType: 'product_change_task',
      entityId: task.id,
      action: 'reassigned',
      summary: `${ctx.profile.name}님이 ${task.productName} 변경 적용 담당자를 ${result.assigneeName}님으로 이관했습니다.`,
      metadata: {
        from_assignee_id: task.fromAssigneeId,
        to_assignee_id: input.userId,
        reason: transferReason,
        source: 'product_assignment_change',
      },
    })
  }
}

export async function assignDuty(
  ctx: RepositoryContext,
  input: { userId: string; dutyId: string },
): Promise<void> {
  const changed = await masterRepository(ctx).assignDuty(input)
  if (!changed) return
  await logMasterActivity(ctx, 'duty_assignment', 'created', '업무를 배정했습니다.', input.dutyId, {
    user_id: input.userId,
  })
}

export async function updateProduct(
  ctx: RepositoryContext,
  productId: string,
  payload: {
    name: string
    category?: ProductCategory | string | null
    company_name?: string | null
    unassigned_reason?: string | null
    sort_order?: number | null
  },
): Promise<void> {
  const normalizedPayload = payload.unassigned_reason === undefined
    ? payload
    : { ...payload, unassigned_reason: normalizeUnassignedReason(payload.unassigned_reason) }
  await masterRepository(ctx).updateProduct(productId, normalizedPayload)
  await logMasterActivity(ctx, 'product', 'updated', '제품 정보를 수정했습니다.', productId, normalizedPayload)
}

export async function updateDutyMajorCategory(
  ctx: RepositoryContext,
  majorCategoryId: string,
  payload: { name: string; sort_order?: number | null },
): Promise<void> {
  await masterRepository(ctx).updateDutyMajorCategory(majorCategoryId, payload)
  await logMasterActivity(
    ctx,
    'duty_major_category',
    'updated',
    '업무 대분류를 수정했습니다.',
    majorCategoryId,
    payload,
  )
}

export async function updateDuty(
  ctx: RepositoryContext,
  dutyId: string,
  payload: { name: string; major_category_id: string; sort_order?: number | null },
): Promise<void> {
  await masterRepository(ctx).updateDuty(dutyId, payload)
  await logMasterActivity(ctx, 'duty', 'updated', '업무 정보를 수정했습니다.', dutyId, payload)
}

export async function updateInvite(
  ctx: RepositoryContext,
  inviteId: string,
  payload: { email: string; name: string; role: Role },
): Promise<void> {
  await masterRepository(ctx).updateInvite(inviteId, payload)
  await logMasterActivity(ctx, 'allowed_user', 'updated', '초대 정보를 수정했습니다.', inviteId, payload)
}

export async function toggleProfileActive(
  ctx: RepositoryContext,
  profileId: string,
  nextActive: boolean,
): Promise<void> {
  await masterRepository(ctx).toggleProfileActive(profileId, nextActive)
  await logMasterActivity(
    ctx,
    'allowed_user',
    nextActive ? 'activated' : 'deactivated',
    nextActive ? '사용자를 활성화했습니다.' : '사용자를 비활성화했습니다.',
    profileId,
    { is_active: nextActive },
  )
}

export async function deleteAllowedUser(ctx: RepositoryContext, id: string): Promise<void> {
  const name = await masterRepository(ctx).deleteAllowedUser(id)
  await logMasterActivity(ctx, 'allowed_user', 'deleted', `${name ?? '초대'} 사용자를 삭제했습니다.`, id)
}

export async function deleteProduct(ctx: RepositoryContext, id: string): Promise<void> {
  const name = await masterRepository(ctx).deleteProduct(id)
  await logMasterActivity(ctx, 'product', 'deleted', `${name ?? '제품'}을 삭제했습니다.`, id)
}

export async function deleteDuty(ctx: RepositoryContext, id: string): Promise<void> {
  const name = await masterRepository(ctx).deleteDuty(id)
  await logMasterActivity(ctx, 'duty', 'deleted', `${name ?? '업무'}를 삭제했습니다.`, id)
}

export async function deleteDutyMajorCategory(ctx: RepositoryContext, id: string): Promise<void> {
  const name = await masterRepository(ctx).deleteDutyMajorCategory(id)
  await logMasterActivity(ctx, 'duty_major_category', 'deleted', `${name ?? '대분류'}를 삭제했습니다.`, id)
}
