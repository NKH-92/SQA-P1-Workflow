import { makeId } from '../../lib/format'
import { supabase } from '../../lib/supabase'
import type { AdminDeleteTable } from '../../app/types'
import type { Role } from '../../types'
import type { RepositoryContext } from '../repositoryContext'

export async function importProducts(
  ctx: RepositoryContext,
  rows: Array<{ name: string; code: string }>,
): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!
      .from('products')
      .insert(rows.map((row) => ({ name: row.name.trim(), code: row.code.trim() || null })))
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      products: [
        ...rows.map((row) => ({ id: makeId('product'), name: row.name.trim(), code: row.code.trim() || null })),
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
  input: { name: string; code: string },
): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('products').insert({ name: input.name, code: input.code || null })
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      products: [{ id: makeId('product'), name: input.name, code: input.code || null }, ...current.products],
    }))
  }
}

export async function addDuty(ctx: RepositoryContext, name: string): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duties').insert({ name })
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      duties: [{ id: makeId('duty'), name }, ...current.duties],
    }))
  }
}

export async function assignProduct(
  ctx: RepositoryContext,
  input: { userId: string; productId: string; status: string },
): Promise<void> {
  const { data, setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('product_assignments').insert({
      user_id: input.userId,
      product_id: input.productId,
      status: input.status || null,
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
          status: input.status || null,
          profiles: member ? { name: member.name, email: member.email } : null,
          products: product ? { name: product.name, code: product.code } : null,
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
          duties: duty ? { name: duty.name } : null,
        },
        ...current.dutyAssignments,
      ],
    }))
  }
}

export async function updateProduct(
  ctx: RepositoryContext,
  productId: string,
  payload: { name: string; code: string | null },
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
          ? { ...assignment, products: { name: payload.name, code: payload.code } }
          : assignment,
      ),
    }))
  }
}

export async function updateDuty(ctx: RepositoryContext, dutyId: string, name: string): Promise<void> {
  const { setData } = ctx
  if (ctx.isRemote) {
    const { error } = await supabase!.from('duties').update({ name }).eq('id', dutyId)
    if (error) throw error
  } else {
    setData((current) => ({
      ...current,
      duties: current.duties.map((item) => (item.id === dutyId ? { ...item, name } : item)),
      dutyAssignments: current.dutyAssignments.map((assignment) =>
        assignment.duty_id === dutyId ? { ...assignment, duties: { name } } : assignment,
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
