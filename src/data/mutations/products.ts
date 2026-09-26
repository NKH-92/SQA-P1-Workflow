import { recordActivityLog } from '../activityLog'
import { UserFacingError } from '../../lib/errors'
import { quotedWithJosa } from '../../lib/korean'
import type { Product, ProductCategory } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import type { AuditedDeleteInput } from '../contracts'
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
    throw new UserFacingError('담당자가 없는 이유는 1,000자 이하로 입력해 주세요.')
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
  await logAdminActivity(ctx, 'product', 'created', `제품 ${products.length}개를 가져왔어요.`, null, {
    count: products.length,
  })
}

export async function addProduct(ctx: RepositoryContext, input: ProductInput): Promise<void> {
  const product = normalizeProductInput(input)
  await ctx.repositories.products.addProduct(product)
  await logAdminActivity(ctx, 'product', 'created', `${quotedWithJosa(product.name, '을/를')} 제품으로 등록했어요.`, null, product)
}

export async function saveProductAssignments(
  ctx: RepositoryContext,
  input: {
    productId: string
    nextMemberIds: string[]
    unassignedReason?: string | null
    reason: string
    product?: Product | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
    expectedUpdatedAt?: string | null
  },
): Promise<{ noop: boolean }> {
  const normalizedReason = normalizeUnassignedReason(input.unassignedReason)
  const result = await ctx.repositories.products.saveProductAssignments({
    ...input,
    unassignedReason: normalizedReason,
  })
  // A true set no-op must not write a user-facing activity entry.
  if (result.noop) return { noop: true }
  await logAdminActivity(ctx, 'product_assignment', 'updated', '제품 담당자를 바꿨어요.', input.productId, {
    assigned_user_ids: input.nextMemberIds,
    unassigned_reason: input.nextMemberIds.length === 0 ? normalizedReason : null,
  })
  return { noop: false }
}

export async function assignProduct(
  ctx: RepositoryContext,
  input: {
    userId: string
    productId: string
    transferPendingChangeTasks?: boolean
    transferReason?: string
  },
): Promise<{ noop: boolean }> {
  const transferPending = input.transferPendingChangeTasks === true
  const transferReason = input.transferReason?.trim() || null
  const result = await ctx.repositories.products.assignProduct({
    userId: input.userId,
    productId: input.productId,
    transferPending,
    transferReason,
  })
  // A no-op duplicate must not produce a client activity log — the assignment already
  // exists, so nothing actually changed for the private authoritative audit either (D-05).
  if (result.kind === 'noop') return { noop: true }
  if (result.kind === 'server-audited') return { noop: false }

  const metadata = result.includeTransferredTaskCount
    ? { user_id: input.userId, transferred_task_count: result.transferredTasks.length }
    : { user_id: input.userId }
  await logAdminActivity(
    ctx,
    'product_assignment',
    result.action,
    transferPending ? '제품 담당자를 배정하고 미완료 적용 업무를 넘겼어요.' : '제품 담당자를 배정했어요.',
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
      summary: `${ctx.profile.name}님이 ${task.productName} 적용 업무 담당자를 ${result.assigneeName}님으로 바꿨어요.`,
      metadata: {
        from_assignee_id: task.fromAssigneeId,
        to_assignee_id: input.userId,
        reason: transferReason,
        source: 'product_assignment_change',
      },
    })
  }
  return { noop: false }
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
    expectedUpdatedAt: string | null
    reason: string
  },
): Promise<{ noop: boolean }> {
  const normalizedPayload = payload.unassigned_reason === undefined
    ? payload
    : { ...payload, unassigned_reason: normalizeUnassignedReason(payload.unassigned_reason) }
  const result = await ctx.repositories.products.updateProduct(productId, normalizedPayload)
  // D-05: a no-op update must not add a user-facing activity-log entry either —
  // nothing actually changed, so there is nothing to announce.
  if (!result.noop) {
    await logAdminActivity(ctx, 'product', 'updated', '제품 정보를 수정했어요.', productId, normalizedPayload)
  }
  return result
}

export async function deleteProduct(ctx: RepositoryContext, id: string, input: AuditedDeleteInput): Promise<void> {
  const name = await ctx.repositories.products.deleteProduct(id, input)
  await logAdminActivity(ctx, 'product', 'deleted', `${quotedWithJosa(name ?? '제품', '을/를')} 삭제했어요.`, id, {
    reason: input.reason.trim(),
  })
}
