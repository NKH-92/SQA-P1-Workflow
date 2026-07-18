import { recordActivityLog } from '../activityLog'
import { UserFacingError } from '../../lib/errors'
import type { Product, ProductCategory } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import { logAdminActivity } from './adminActivity'

export type ProductInput = {
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

export async function importProducts(ctx: RepositoryContext, rows: ProductInput[]): Promise<void> {
  const products = rows.map(normalizeProductInput)
  await ctx.repositories.products.importProducts(products)
  await logAdminActivity(ctx, 'product', 'created', `${products.length}개 제품을 가져왔습니다.`, null, {
    count: products.length,
  })
}

export async function addProduct(ctx: RepositoryContext, input: ProductInput): Promise<void> {
  const product = normalizeProductInput(input)
  await ctx.repositories.products.addProduct(product)
  await logAdminActivity(ctx, 'product', 'created', `${product.name} 제품을 추가했습니다.`, null, product)
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
  await ctx.repositories.products.saveProductAssignments({ ...input, unassignedReason: normalizedReason })
  await logAdminActivity(ctx, 'product_assignment', 'updated', '제품 배정을 조정했습니다.', input.productId, {
    assigned_user_ids: input.nextMemberIds,
    unassigned_reason: input.nextMemberIds.length === 0 ? normalizedReason : null,
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
  const result = await ctx.repositories.products.assignProduct({
    userId: input.userId,
    productId: input.productId,
    transferPending,
    transferReason,
  })
  if (result.kind === 'noop' || result.kind === 'server-audited') return

  const metadata = result.includeTransferredTaskCount
    ? { user_id: input.userId, transferred_task_count: result.transferredTasks.length }
    : { user_id: input.userId }
  await logAdminActivity(
    ctx,
    'product_assignment',
    result.action,
    transferPending ? '제품을 배정하고 미완료 변경 적용업무를 이관했습니다.' : '제품을 배정했습니다.',
    input.productId,
    metadata,
  )
  for (const task of result.transferredTasks) {
    await recordActivityLog(ctx.repositories.activityLogs, {
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
  await ctx.repositories.products.updateProduct(productId, normalizedPayload)
  await logAdminActivity(ctx, 'product', 'updated', '제품 정보를 수정했습니다.', productId, normalizedPayload)
}

export async function deleteProduct(ctx: RepositoryContext, id: string): Promise<void> {
  const name = await ctx.repositories.products.deleteProduct(id)
  await logAdminActivity(ctx, 'product', 'deleted', `${name ?? '제품'}을 삭제했습니다.`, id)
}
