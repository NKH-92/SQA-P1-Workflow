import type { DutyMajorCategory } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import type { AuditedDeleteInput } from '../contracts'
import { logAdminActivity } from './adminActivity'

export async function addDutyMajorCategory(
  ctx: RepositoryContext,
  input: { name: string; sortOrder?: number | null },
): Promise<void> {
  const payload = { name: input.name.trim(), sort_order: input.sortOrder ?? null }
  await ctx.repositories.duties.addDutyMajorCategory(payload)
  await logAdminActivity(ctx, 'duty_major_category', 'created', `${payload.name} 대분류를 추가했습니다.`, null, payload)
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
  await ctx.repositories.duties.addDuty(payload)
  await logAdminActivity(ctx, 'duty', 'created', `${payload.name} 업무를 추가했습니다.`, null, payload)
}

export async function saveDutyAssignments(
  ctx: RepositoryContext,
  input: {
    dutyId: string
    nextMemberIds: string[]
    reason: string
    duty?: {
      name: string
      major_category_id: string
      duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null
    } | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
    expectedUpdatedAt?: string | null
  },
): Promise<{ noop: boolean }> {
  const result = await ctx.repositories.duties.saveDutyAssignments(input)
  // A true set no-op must not write a user-facing activity entry.
  if (result.noop) return { noop: true }
  await logAdminActivity(ctx, 'duty_assignment', 'updated', '업무 배정을 조정했습니다.', input.dutyId, {
    assigned_user_ids: input.nextMemberIds,
  })
  return { noop: false }
}

export async function assignDuty(
  ctx: RepositoryContext,
  input: { userId: string; dutyId: string },
): Promise<{ noop: boolean }> {
  const changed = await ctx.repositories.duties.assignDuty(input)
  // A no-op duplicate must not produce a client activity log — the assignment already
  // exists, so nothing actually changed for the private authoritative audit either (D-05).
  if (!changed) return { noop: true }
  await logAdminActivity(ctx, 'duty_assignment', 'created', '업무를 배정했습니다.', input.dutyId, {
    user_id: input.userId,
  })
  return { noop: false }
}

export async function updateDutyMajorCategory(
  ctx: RepositoryContext,
  majorCategoryId: string,
  payload: { name: string; sort_order?: number | null; expectedUpdatedAt: string | null; reason: string },
): Promise<{ noop: boolean }> {
  const result = await ctx.repositories.duties.updateDutyMajorCategory(majorCategoryId, payload)
  if (!result.noop) {
    await logAdminActivity(ctx, 'duty_major_category', 'updated', '업무 대분류를 수정했습니다.', majorCategoryId, payload)
  }
  return result
}

export async function updateDuty(
  ctx: RepositoryContext,
  dutyId: string,
  payload: {
    name: string
    major_category_id: string
    sort_order?: number | null
    assignee_label?: string | null
    notes?: string | null
    expectedUpdatedAt: string | null
    reason: string
  },
): Promise<{ noop: boolean }> {
  const result = await ctx.repositories.duties.updateDuty(dutyId, payload)
  if (!result.noop) {
    await logAdminActivity(ctx, 'duty', 'updated', '업무 정보를 수정했습니다.', dutyId, payload)
  }
  return result
}

export async function deleteDuty(ctx: RepositoryContext, id: string, input: AuditedDeleteInput): Promise<void> {
  const name = await ctx.repositories.duties.deleteDuty(id, input)
  await logAdminActivity(ctx, 'duty', 'deleted', `${name ?? '업무'}를 삭제했습니다.`, id, {
    reason: input.reason.trim(),
  })
}

export async function deleteDutyMajorCategory(
  ctx: RepositoryContext,
  id: string,
  input: AuditedDeleteInput,
): Promise<void> {
  const name = await ctx.repositories.duties.deleteDutyMajorCategory(id, input)
  await logAdminActivity(ctx, 'duty_major_category', 'deleted', `${name ?? '대분류'}를 삭제했습니다.`, id, {
    reason: input.reason.trim(),
  })
}
