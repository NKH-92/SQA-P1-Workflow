import { makeId } from '../../lib/format'
import { assertAffectedRows, assertRecordExists, UserFacingError } from '../../lib/errors'
import { recordActivityLog } from '../../lib/activityLog'
import { canReceiveAssignment } from '../../domain/permissions'
import { supabase } from '../../lib/supabase'
import { selectProductChangeTaskContexts } from '../../features/change-applications/selectors'
import type { Product, ProductCategory, Role, DutyMajorCategory } from '../../types'
import type { RepositoryContext } from '../repositoryContext'
import {
  appendDutyAssignment,
  appendProductAssignment,
  replaceDutyAssignments,
  replaceProductAssignments,
  updateProductRow,
} from '../local/appDataReducers'
import { createLocalMasterRepository } from '../local/localMasterRepository'
import { createSupabaseMasterRepository } from '../remote/supabaseMasterRepository'

type ProductInput = {
  name: string
  category?: ProductCategory | string
  companyName?: string
  sortOrder?: number | null
}

function assertLocalAssignmentLeader(ctx: RepositoryContext) {
  if (ctx.profile.role !== 'leader' || ctx.profile.is_active === false || ctx.profile.must_change_password === true) {
    throw new UserFacingError('활성 파트장 권한이 필요합니다.')
  }
}

const assertLocalLeader = assertLocalAssignmentLeader

function normalizeUnassignedReason(value: string | null | undefined): string | null {
  const reason = value?.trim() || null
  if (reason && reason.length > 1000) {
    throw new UserFacingError('담당자 미지정 사유는 1000자 이하로 입력해 주세요.')
  }
  return reason
}

function assertLocalAssignmentMembers(ctx: RepositoryContext, memberIds: string[]) {
  for (const memberId of new Set(memberIds)) {
    const member = ctx.data.profiles.find((item) => item.id === memberId)
    assertRecordExists(member)
    if (!canReceiveAssignment(member)) {
      throw new UserFacingError('활성 상태인 파트원에게만 배정할 수 있습니다.')
    }
  }
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

export async function importProducts(
  ctx: RepositoryContext,
  rows: ProductInput[],
): Promise<void> {
  const { setData } = ctx
  const products = rows.map(normalizeProductInput)
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('products').insert(products)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      products: [
        ...products.map((product) => ({ id: makeId('product'), ...product })),
        ...current.products,
      ],
    }))
  }
  await logMasterActivity(ctx, 'product', 'created', `${products.length}개 제품을 가져왔습니다.`, null, { count: products.length })
}

export async function importInvites(
  ctx: RepositoryContext,
  rows: Array<{ email: string; name: string; role: Role }>,
): Promise<void> {
  const { profile, setData } = ctx
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('allowed_users').insert(
      rows.map((row) => ({
        email: row.email,
        name: row.name.trim(),
        role: row.role,
        created_by: profile.id,
      })),
    )
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      allowedUsers: [
        ...rows.map((row) => ({
          id: makeId('allowed'),
          email: row.email,
          name: row.name.trim(),
          role: row.role,
          created_at: new Date().toISOString(),
        })),
        ...current.allowedUsers,
      ],
      // Mirror addAllowedUser: reflect imported invites in the team list too, so demo
      // single-add and CSV-add behave the same.
      profiles: [
        ...rows.map((row) => ({
          id: makeId('profile'),
          email: row.email,
          name: row.name.trim(),
          role: row.role,
        })),
        ...current.profiles,
      ],
    }))
  }
  await logMasterActivity(ctx, 'allowed_user', 'created', `${rows.length}개 초대를 가져왔습니다.`, null, { count: rows.length })
}

export async function addAllowedUser(
  ctx: RepositoryContext,
  input: { email: string; name: string; role: Role },
): Promise<void> {
  const { profile, setData } = ctx
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('allowed_users').insert({
      email: input.email,
      name: input.name,
      role: input.role,
      created_by: profile.id,
    })
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      allowedUsers: [{ id: makeId('allowed'), ...input, created_at: new Date().toISOString() }, ...current.allowedUsers],
      profiles: [
        { id: makeId('profile'), email: input.email, name: input.name, role: input.role },
        ...current.profiles,
      ],
    }))
  }
  await logMasterActivity(ctx, 'allowed_user', 'created', `${input.name} 초대를 추가했습니다.`, null, { email: input.email, role: input.role })
}

export async function addProduct(
  ctx: RepositoryContext,
  input: ProductInput,
): Promise<void> {
  const { setData } = ctx
  const product = normalizeProductInput(input)
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('products').insert(product)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      products: [{ id: makeId('product'), ...product }, ...current.products],
    }))
  }
  await logMasterActivity(ctx, 'product', 'created', `${product.name} 제품을 추가했습니다.`, null, product)
}

export async function addDutyMajorCategory(
  ctx: RepositoryContext,
  input: { name: string; sortOrder?: number | null },
): Promise<void> {
  const { setData } = ctx
  const payload = {
    name: input.name.trim(),
    sort_order: input.sortOrder ?? null,
  }
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duty_major_categories').insert(payload)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      dutyMajorCategories: [{ id: makeId('duty-major'), ...payload }, ...current.dutyMajorCategories],
    }))
  }
  await logMasterActivity(ctx, 'duty_major_category', 'created', `${payload.name} 대분류를 추가했습니다.`, null, payload)
}

function dutyRelation(duty: { name: string; major_category_id: string; duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null }) {
  return {
    name: duty.name,
    major_category_id: duty.major_category_id,
    duty_major_categories: duty.duty_major_categories ?? null,
  }
}

export async function addDuty(
  ctx: RepositoryContext,
  input: { majorCategoryId: string; name: string; sortOrder?: number | null },
): Promise<void> {
  const { data, setData } = ctx
  const payload = {
    major_category_id: input.majorCategoryId,
    name: input.name.trim(),
    sort_order: input.sortOrder ?? null,
  }
  const majorCategory = data.dutyMajorCategories.find((item) => item.id === input.majorCategoryId)
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duties').insert(payload)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      duties: [
        {
          id: makeId('duty'),
          ...payload,
          duty_major_categories: majorCategory ? { name: majorCategory.name, sort_order: majorCategory.sort_order ?? null } : null,
        },
        ...current.duties,
      ],
    }))
  }
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
  const { data, setData } = ctx
  const { productId, nextMemberIds, unassignedReason, product, memberOptions } = input
  const normalizedReason = normalizeUnassignedReason(unassignedReason)

  if (ctx.isRemote) {
    const { error } = await supabase!.rpc('replace_product_assignments_with_reason', {
      p_product_id: productId,
      p_member_ids: nextMemberIds,
      p_unassigned_reason: normalizedReason,
    })
    if (error) throw error
  } else {
    assertLocalAssignmentLeader(ctx)
    assertLocalAssignmentMembers(ctx, nextMemberIds)
    const resolvedProduct = product ?? data.products.find((item) => item.id === productId) ?? null
    assertRecordExists(resolvedProduct)
    const members =
      memberOptions?.map((item) => item) ??
      data.profiles.map((item) => ({ id: item.id, name: item.name, email: item.email }))
    setData((current) =>
      replaceProductAssignments(current, productId, nextMemberIds, resolvedProduct, members, normalizedReason),
    )
  }
  await logMasterActivity(ctx, 'product_assignment', 'updated', '제품 배정을 조정했습니다.', productId, {
    assigned_user_ids: nextMemberIds,
    unassigned_reason: nextMemberIds.length === 0 ? normalizedReason : null,
  })
}

export async function saveDutyAssignments(
  ctx: RepositoryContext,
  input: {
    dutyId: string
    nextMemberIds: string[]
    duty?: { name: string; major_category_id: string; duty_major_categories?: DutyMajorCategory | Pick<DutyMajorCategory, 'name' | 'sort_order'> | null } | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
  },
): Promise<void> {
  const { data, setData } = ctx
  const { dutyId, nextMemberIds, duty, memberOptions } = input

  if (ctx.isRemote) {
    const { error } = await supabase!.rpc('replace_duty_assignments', {
      p_duty_id: dutyId,
      p_member_ids: nextMemberIds,
    })
    if (error) throw error
  } else {
    assertLocalAssignmentLeader(ctx)
    assertLocalAssignmentMembers(ctx, nextMemberIds)
    const resolvedDuty = duty ?? data.duties.find((item) => item.id === dutyId) ?? null
    assertRecordExists(resolvedDuty)
    const members =
      memberOptions?.map((item) => item) ??
      data.profiles.map((item) => ({ id: item.id, name: item.name, email: item.email }))
    const dutyForReducer = resolvedDuty
      ? {
          ...resolvedDuty,
          duty_major_categories:
            resolvedDuty.duty_major_categories ??
            data.dutyMajorCategories.find((item) => item.id === resolvedDuty.major_category_id) ??
            null,
        }
      : null
    setData((current) => replaceDutyAssignments(current, dutyId, nextMemberIds, dutyForReducer, members))
  }
  await logMasterActivity(ctx, 'duty_assignment', 'updated', '업무 배정을 조정했습니다.', dutyId, { assigned_user_ids: nextMemberIds })
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
  const { data, setData } = ctx
  const transferPending = input.transferPendingChangeTasks === true
  const transferReason = input.transferReason?.trim() || null
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    if (transferPending) {
      const { error } = await supabase!.rpc('assign_product_and_transfer_change_tasks', {
        p_product_id: input.productId,
        p_user_id: input.userId,
        p_transfer_pending: true,
        p_reason: transferReason,
      })
      if (error) throw error
      return
    }
    const { error } = await supabase!.rpc('add_product_assignment', {
      p_product_id: input.productId,
      p_user_id: input.userId,
    })
    if (error) throw error
    await logMasterActivity(ctx, 'product_assignment', 'created', '제품을 배정했습니다.', input.productId, { user_id: input.userId })
    return
  }

  const alreadyAssigned = data.productAssignments.some(
    (assignment) => assignment.product_id === input.productId && assignment.user_id === input.userId,
  )
  const member = data.profiles.find((item) => item.id === input.userId)
  const product = data.products.find((item) => item.id === input.productId)
  assertRecordExists(member)
  assertRecordExists(product)
  if (!canReceiveAssignment(member)) {
    throw new UserFacingError('활성 상태인 파트원에게만 제품을 배정할 수 있습니다.')
  }
  if (transferPending && !transferReason) {
    throw new UserFacingError('미완료 변경 적용업무 이관 사유가 필요합니다.')
  }
  if (alreadyAssigned && !transferPending) return

  const transferContexts = transferPending
    ? selectProductChangeTaskContexts(data).filter(
        ({ task, application }) =>
          task.product_id === input.productId
          && task.status === 'pending'
          && task.assignee_id !== input.userId
          && application.status === 'published',
      )
    : []
  const transferTaskIds = new Set(transferContexts.map(({ task }) => task.id))
  const now = new Date().toISOString()
  setData((current) => {
    const assigned = alreadyAssigned
      ? current
      : appendProductAssignment(current, input.userId, input.productId, member, product)
    if (!transferPending) return assigned
    return {
      ...assigned,
      productChangeTasks: assigned.productChangeTasks.map((task) => transferTaskIds.has(task.id) ? {
        ...task,
        assignee_id: input.userId,
        assignee_name: member.name,
        updated_at: now,
      } : task),
    }
  })
  await logMasterActivity(
    ctx,
    'product_assignment',
    alreadyAssigned ? 'updated' : 'created',
    transferPending ? '제품을 배정하고 미완료 변경 적용업무를 이관했습니다.' : '제품을 배정했습니다.',
    input.productId,
    { user_id: input.userId, transferred_task_count: transferContexts.length },
  )
  for (const { task } of transferContexts) {
    await recordActivityLog(setData, {
      actor: ctx.profile,
      targetUserId: input.userId,
      entityType: 'product_change_task',
      entityId: task.id,
      action: 'reassigned',
      summary: `${ctx.profile.name}님이 ${task.product_name} 변경 적용 담당자를 ${member.name}님으로 이관했습니다.`,
      metadata: {
        from_assignee_id: task.assignee_id,
        to_assignee_id: input.userId,
        reason: transferReason,
        source: 'product_assignment_change',
      },
    })
  }
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

export async function assignDuty(
  ctx: RepositoryContext,
  input: { userId: string; dutyId: string },
): Promise<void> {
  const { data, setData } = ctx
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { error } = await supabase!.rpc('add_duty_assignment', {
      p_duty_id: input.dutyId,
      p_user_id: input.userId,
    })
    if (error) throw error
    await logMasterActivity(ctx, 'duty_assignment', 'created', '업무를 배정했습니다.', input.dutyId, { user_id: input.userId })
    return
  }

  const alreadyAssigned = data.dutyAssignments.some(
    (assignment) => assignment.duty_id === input.dutyId && assignment.user_id === input.userId,
  )
  if (alreadyAssigned) return
  const member = data.profiles.find((item) => item.id === input.userId)
  const duty = data.duties.find((item) => item.id === input.dutyId)
  assertRecordExists(member)
  assertRecordExists(duty)
  if (!canReceiveAssignment(member)) {
    throw new UserFacingError('활성 상태인 파트원에게만 업무를 배정할 수 있습니다.')
  }
  const dutySnapshot = duty
    ? dutyRelation({
        ...duty,
        duty_major_categories: data.dutyMajorCategories.find((item) => item.id === duty.major_category_id) ?? null,
      })
    : null
  setData((current) => appendDutyAssignment(current, input.userId, input.dutyId, member, dutySnapshot))
  await logMasterActivity(ctx, 'duty_assignment', 'created', '업무를 배정했습니다.', input.dutyId, { user_id: input.userId })
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
  const { data, setData } = ctx
  const normalizedPayload = payload.unassigned_reason === undefined
    ? payload
    : { ...payload, unassigned_reason: normalizeUnassignedReason(payload.unassigned_reason) }
  if (ctx.isRemote) {
    const { data: affected, error } = await supabase!.from('products').update(normalizedPayload).eq('id', productId).select('id')
    if (error) throw error
    assertAffectedRows(affected)
  } else {
    assertRecordExists(data.products.find((item) => item.id === productId))
    setData((current) => updateProductRow(current, productId, normalizedPayload))
  }
  await logMasterActivity(ctx, 'product', 'updated', '제품 정보를 수정했습니다.', productId, normalizedPayload)
}

export async function updateDutyMajorCategory(
  ctx: RepositoryContext,
  majorCategoryId: string,
  payload: { name: string; sort_order?: number | null },
): Promise<void> {
  const { data, setData } = ctx
  if (ctx.isRemote) {
    const { data: affected, error } = await supabase!
      .from('duty_major_categories')
      .update(payload)
      .eq('id', majorCategoryId)
      .select('id')
    if (error) throw error
    assertAffectedRows(affected)
  } else {
    assertRecordExists(data.dutyMajorCategories.find((item) => item.id === majorCategoryId))
    setData((current) => ({
      ...current,
      dutyMajorCategories: current.dutyMajorCategories.map((item) =>
        item.id === majorCategoryId ? { ...item, ...payload } : item,
      ),
      duties: current.duties.map((item) =>
        item.major_category_id === majorCategoryId
          ? {
              ...item,
              duty_major_categories: {
                name: payload.name,
                sort_order: payload.sort_order ?? item.duty_major_categories?.sort_order ?? null,
              },
            }
          : item,
      ),
      dutyAssignments: current.dutyAssignments.map((assignment) =>
        assignment.duties?.major_category_id === majorCategoryId
          ? {
              ...assignment,
              duties: {
                ...(assignment.duties ?? { name: '', major_category_id: majorCategoryId }),
                duty_major_categories: { name: payload.name },
              },
            }
          : assignment,
      ),
    }))
  }
  await logMasterActivity(ctx, 'duty_major_category', 'updated', '업무 대분류를 수정했습니다.', majorCategoryId, payload)
}

export async function updateDuty(
  ctx: RepositoryContext,
  dutyId: string,
  payload: { name: string; major_category_id: string; sort_order?: number | null },
): Promise<void> {
  const { data, setData } = ctx
  const majorCategory = data.dutyMajorCategories.find((item) => item.id === payload.major_category_id)
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { data: affected, error } = await supabase!.from('duties').update(payload).eq('id', dutyId).select('id')
    if (error) throw error
    assertAffectedRows(affected)
  } else {
    assertRecordExists(data.duties.find((item) => item.id === dutyId))
    setData((current) => ({
      ...current,
      duties: current.duties.map((item) =>
        item.id === dutyId
          ? {
              ...item,
              ...payload,
              duty_major_categories: majorCategory
                ? { name: majorCategory.name, sort_order: majorCategory.sort_order ?? null }
                : item.duty_major_categories,
            }
          : item,
      ),
      dutyAssignments: current.dutyAssignments.map((assignment) =>
        assignment.duty_id === dutyId
          ? {
              ...assignment,
              duties: dutyRelation({
                name: payload.name,
                major_category_id: payload.major_category_id,
                duty_major_categories: majorCategory ?? null,
              }),
            }
          : assignment,
      ),
    }))
  }
  await logMasterActivity(ctx, 'duty', 'updated', '업무 정보를 수정했습니다.', dutyId, payload)
}

export async function updateInvite(
  ctx: RepositoryContext,
  inviteId: string,
  payload: { email: string; name: string; role: Role },
): Promise<void> {
  const { data, setData } = ctx
  if (!ctx.isRemote) assertLocalLeader(ctx)
  if (ctx.isRemote) {
    const { data: affected, error } = await supabase!
      .from('allowed_users')
      .update(payload)
      .eq('id', inviteId)
      .select('id')
    if (error) throw error
    assertAffectedRows(affected)
  } else {
    assertRecordExists(data.allowedUsers.find((item) => item.id === inviteId))
    setData((current) => ({
      ...current,
      allowedUsers: current.allowedUsers.map((item) =>
        item.id === inviteId ? { ...item, ...payload } : item,
      ),
    }))
  }
  await logMasterActivity(ctx, 'allowed_user', 'updated', '초대 정보를 수정했습니다.', inviteId, payload)
}

export async function toggleProfileActive(
  ctx: RepositoryContext,
  profileId: string,
  nextActive: boolean,
): Promise<void> {
  const { data, setData } = ctx
  if (ctx.isRemote) {
    const { data: affected, error } = await supabase!
      .from('profiles')
      .update({ is_active: nextActive })
      .eq('id', profileId)
      .select('id')
    if (error) throw error
    assertAffectedRows(affected)
  } else {
    assertLocalAssignmentLeader(ctx)
    const target = data.profiles.find((item) => item.id === profileId)
    assertRecordExists(target)
    if (target.role === 'leader' && target.is_active !== false && !nextActive) {
      const remainingLeaders = data.profiles.filter(
        (item) => item.role === 'leader' && item.is_active !== false && item.id !== profileId,
      )
      if (remainingLeaders.length === 0) {
        throw new UserFacingError('활성 파트장은 최소 한 명 이상 유지해야 합니다.')
      }
    }
    setData((current) => ({
      ...current,
      profiles: current.profiles.map((item) => (item.id === profileId ? { ...item, is_active: nextActive } : item)),
    }))
  }
  await logMasterActivity(ctx, 'allowed_user', nextActive ? 'activated' : 'deactivated', nextActive ? '사용자를 활성화했습니다.' : '사용자를 비활성화했습니다.', profileId, { is_active: nextActive })
}

function masterRepository(ctx: RepositoryContext) {
  return ctx.isRemote ? createSupabaseMasterRepository(ctx) : createLocalMasterRepository(ctx)
}

export async function deleteAllowedUser(ctx: RepositoryContext, id: string): Promise<void> {
  return masterRepository(ctx).deleteAllowedUser(id)
}

export async function deleteProduct(ctx: RepositoryContext, id: string): Promise<void> {
  return masterRepository(ctx).deleteProduct(id)
}

export async function deleteDuty(ctx: RepositoryContext, id: string): Promise<void> {
  return masterRepository(ctx).deleteDuty(id)
}

export async function deleteDutyMajorCategory(ctx: RepositoryContext, id: string): Promise<void> {
  return masterRepository(ctx).deleteDutyMajorCategory(id)
}
