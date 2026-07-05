import { makeId } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { AdminDeleteTable } from '../../app/types'
import type { Product, ProductCategory, Role, DutyMajorCategory } from '../../types'
import type { RepositoryContext } from '../repositoryContext'

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

export async function assignProduct(
  ctx: RepositoryContext,
  input: { userId: string; productId: string },
): Promise<void> {
  const { data, setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('product_assignments').insert({
      user_id: input.userId,
      product_id: input.productId,
    })
    if (error) throw error
  } else {
    const member = data.profiles.find((item) => item.id === input.userId)
    const product = data.products.find((item) => item.id === input.productId)
    setData((current) => ({
      ...current,
      productAssignments: [
        {
          id: makeId('product-assignment'),
          user_id: input.userId,
          product_id: input.productId,
          profiles: member ? { name: member.name, email: member.email } : null,
          products: product ? productRelation(product) : null,
        },
        ...current.productAssignments,
      ],
    }))
  }
}

export async function assignDuty(
  ctx: RepositoryContext,
  input: { userId: string; dutyId: string },
): Promise<void> {
  const { data, setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duty_assignments').insert({ user_id: input.userId, duty_id: input.dutyId })
    if (error) throw error
  } else {
    const member = data.profiles.find((item) => item.id === input.userId)
    const duty = data.duties.find((item) => item.id === input.dutyId)
    setData((current) => ({
      ...current,
      dutyAssignments: [
        {
          id: makeId('duty-assignment'),
          user_id: input.userId,
          duty_id: input.dutyId,
          profiles: member ? { name: member.name, email: member.email } : null,
          duties: duty ? dutyRelation({ ...duty, duty_major_categories: data.dutyMajorCategories.find((item) => item.id === duty.major_category_id) ?? null }) : null,
        },
        ...current.dutyAssignments,
      ],
    }))
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
    setData((current) => ({
      ...current,
      products: current.products.map((item) => (item.id === productId ? { ...item, ...payload } : item)),
      productAssignments: current.productAssignments.map((assignment) =>
        assignment.product_id === productId
          ? { ...assignment, products: { ...(assignment.products ?? {}), ...payload } }
          : assignment,
      ),
    }))
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

export async function deleteMasterRow(ctx: RepositoryContext, table: AdminDeleteTable, id: string): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from(table).delete().eq('id', id)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      allowedUsers: table === 'allowed_users' ? current.allowedUsers.filter((item) => item.id !== id) : current.allowedUsers,
      products: table === 'products' ? current.products.filter((item) => item.id !== id) : current.products,
      dutyMajorCategories:
        table === 'duty_major_categories'
          ? current.dutyMajorCategories.filter((item) => item.id !== id)
          : current.dutyMajorCategories,
      duties: table === 'duties' ? current.duties.filter((item) => item.id !== id) : current.duties,
      productAssignments:
        table === 'products'
          ? current.productAssignments.filter((item) => item.product_id !== id)
          : table === 'product_assignments'
            ? current.productAssignments.filter((item) => item.id !== id)
            : current.productAssignments,
      dutyAssignments:
        table === 'duties'
          ? current.dutyAssignments.filter((item) => item.duty_id !== id)
          : table === 'duty_assignments'
            ? current.dutyAssignments.filter((item) => item.id !== id)
            : current.dutyAssignments,
    }))
  }
}
