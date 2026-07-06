import { makeId } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { AdminDeleteTable } from '../../app/types'
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

function normalizeProductInput(input: ProductInput) {
  const category = input.category?.trim() || '자사'
  return {
    name: input.name.trim(),
    category,
    company_name: input.companyName?.trim() || (category === '자사' ? '자사' : ''),
    sort_order: input.sortOrder ?? null,
  }
}

function productRelation(product: Product) {
  return {
    name: product.name,
    category: product.category,
    company_name: product.company_name,
    sort_order: product.sort_order,
  }
}

export async function importProducts(
  ctx: RepositoryContext,
  rows: ProductInput[],
): Promise<void> {
  const { setData } = ctx
  const products = rows.map(normalizeProductInput)
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
}

export async function importInvites(
  ctx: RepositoryContext,
  rows: Array<{ email: string; name: string; role: Role }>,
): Promise<void> {
  const { profile, setData } = ctx
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
    }))
  }
}

export async function addAllowedUser(
  ctx: RepositoryContext,
  input: { email: string; name: string; role: Role },
): Promise<void> {
  const { profile, setData } = ctx
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
}

export async function addProduct(
  ctx: RepositoryContext,
  input: ProductInput,
): Promise<void> {
  const { setData } = ctx
  const product = normalizeProductInput(input)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('products').insert(product)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      products: [{ id: makeId('product'), ...product }, ...current.products],
    }))
  }
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
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duty_major_categories').insert(payload)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      dutyMajorCategories: [{ id: makeId('duty-major'), ...payload }, ...current.dutyMajorCategories],
    }))
  }
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
}

export async function saveProductAssignments(
  ctx: RepositoryContext,
  input: {
    productId: string
    nextMemberIds: string[]
    product?: Product | null
    memberOptions?: Array<{ id: string; name: string; email: string }>
  },
): Promise<void> {
  const { data, setData } = ctx
  const { productId, nextMemberIds, product, memberOptions } = input

  if (ctx.isRemote) {
    const { error } = await supabase!.rpc('replace_product_assignments', {
      p_product_id: productId,
      p_member_ids: nextMemberIds,
    })
    if (error) throw error
  } else {
    const resolvedProduct = product ?? data.products.find((item) => item.id === productId) ?? null
    const members =
      memberOptions?.map((item) => item) ??
      data.profiles.map((item) => ({ id: item.id, name: item.name, email: item.email }))
    setData((current) =>
      replaceProductAssignments(current, productId, nextMemberIds, resolvedProduct, members),
    )
  }
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
    const resolvedDuty = duty ?? data.duties.find((item) => item.id === dutyId) ?? null
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
}

export async function assignProduct(
  ctx: RepositoryContext,
  input: { userId: string; productId: string },
): Promise<void> {
  const { data, setData } = ctx
  const currentIds = data.productAssignments
    .filter((assignment) => assignment.product_id === input.productId)
    .map((assignment) => assignment.user_id)
  if (currentIds.includes(input.userId)) return

  if (ctx.isRemote) {
    await saveProductAssignments(ctx, {
      productId: input.productId,
      nextMemberIds: [...currentIds, input.userId],
    })
    return
  } else {
    const member = data.profiles.find((item) => item.id === input.userId)
    const product = data.products.find((item) => item.id === input.productId)
    setData((current) => appendProductAssignment(current, input.userId, input.productId, member, product))
  }
}

export async function assignDuty(
  ctx: RepositoryContext,
  input: { userId: string; dutyId: string },
): Promise<void> {
  const { data, setData } = ctx
  const currentIds = data.dutyAssignments
    .filter((assignment) => assignment.duty_id === input.dutyId)
    .map((assignment) => assignment.user_id)
  if (currentIds.includes(input.userId)) return

  if (ctx.isRemote) {
    await saveDutyAssignments(ctx, {
      dutyId: input.dutyId,
      nextMemberIds: [...currentIds, input.userId],
    })
    return
  } else {
    const member = data.profiles.find((item) => item.id === input.userId)
    const duty = data.duties.find((item) => item.id === input.dutyId)
    const dutySnapshot = duty
      ? dutyRelation({
          ...duty,
          duty_major_categories: data.dutyMajorCategories.find((item) => item.id === duty.major_category_id) ?? null,
        })
      : null
    setData((current) => appendDutyAssignment(current, input.userId, input.dutyId, member, dutySnapshot))
  }
}

export async function updateProduct(
  ctx: RepositoryContext,
  productId: string,
  payload: { name: string; category?: ProductCategory | string | null; company_name?: string | null; sort_order?: number | null },
): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('products').update(payload).eq('id', productId)
    if (error) throw error
  } else {
    setData((current) => updateProductRow(current, productId, payload))
  }
}

export async function updateDutyMajorCategory(
  ctx: RepositoryContext,
  majorCategoryId: string,
  payload: { name: string; sort_order?: number | null },
): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duty_major_categories').update(payload).eq('id', majorCategoryId)
    if (error) throw error
  } else {
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
}

export async function updateDuty(
  ctx: RepositoryContext,
  dutyId: string,
  payload: { name: string; major_category_id: string; sort_order?: number | null },
): Promise<void> {
  const { data, setData } = ctx
  const majorCategory = data.dutyMajorCategories.find((item) => item.id === payload.major_category_id)
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duties').update(payload).eq('id', dutyId)
    if (error) throw error
  } else {
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
}

export async function updateInvite(
  ctx: RepositoryContext,
  inviteId: string,
  payload: { email: string; name: string; role: Role },
): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('allowed_users').update(payload).eq('id', inviteId)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      allowedUsers: current.allowedUsers.map((item) =>
        item.id === inviteId ? { ...item, ...payload } : item,
      ),
    }))
  }
}

export async function toggleProfileActive(
  ctx: RepositoryContext,
  profileId: string,
  nextActive: boolean,
): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('profiles').update({ is_active: nextActive }).eq('id', profileId)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      profiles: current.profiles.map((item) => (item.id === profileId ? { ...item, is_active: nextActive } : item)),
    }))
  }
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

export async function deleteProductAssignment(ctx: RepositoryContext, id: string): Promise<void> {
  return masterRepository(ctx).deleteProductAssignment(id)
}

export async function deleteDutyAssignment(ctx: RepositoryContext, id: string): Promise<void> {
  return masterRepository(ctx).deleteDutyAssignment(id)
}

export async function deleteMasterEntity(ctx: RepositoryContext, table: AdminDeleteTable, id: string): Promise<void> {
  const repo = masterRepository(ctx)
  switch (table) {
    case 'allowed_users':
      return repo.deleteAllowedUser(id)
    case 'products':
      return repo.deleteProduct(id)
    case 'duties':
      return repo.deleteDuty(id)
    case 'duty_major_categories':
      return repo.deleteDutyMajorCategory(id)
    case 'product_assignments':
      return repo.deleteProductAssignment(id)
    case 'duty_assignments':
      return repo.deleteDutyAssignment(id)
    default: {
      const exhaustive: never = table
      throw new Error(`Unsupported delete table: ${exhaustive}`)
    }
  }
}
