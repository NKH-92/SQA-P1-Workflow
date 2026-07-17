import type {
  AppData,
  ChangeActionItem,
  ChangeApplication,
  Profile,
} from '../../types'
import { daysUntil } from '../../lib/dates'
import {
  selectProductChangeTaskContexts,
  type ProductChangeTaskContext,
} from '../../data/selectors/changeTaskContexts'

export { selectProductChangeTaskContexts, type ProductChangeTaskContext }

export type ChangeScopeProduct = {
  id: string
  name: string
  category: string | null
  companyName: string | null
  sortOrder: number | null
  assignees: Array<{ id: string; name: string }>
}

export function selectChangeScopeProducts(data: AppData): ChangeScopeProduct[] {
  const products = new Map<string, ChangeScopeProduct>()
  for (const row of data.changeProductScope) {
    const product = products.get(row.product_id) ?? {
      id: row.product_id,
      name: row.product_name,
      category: row.category,
      companyName: row.company_name,
      sortOrder: row.sort_order,
      assignees: [],
    }
    if (row.assignee_id && row.assignee_name && !product.assignees.some((item) => item.id === row.assignee_id)) {
      product.assignees.push({ id: row.assignee_id, name: row.assignee_name })
    }
    products.set(row.product_id, product)
  }

  for (const product of data.products) {
    if (products.has(product.id)) continue
    const assignees = data.productAssignments
      .filter((assignment) => assignment.product_id === product.id)
      .map((assignment) => {
        const profile = data.profiles.find((item) => item.id === assignment.user_id)
        return profile ? { id: profile.id, name: profile.name } : null
      })
      .filter((item): item is { id: string; name: string } => Boolean(item))
    products.set(product.id, {
      id: product.id,
      name: product.name,
      category: product.category ?? null,
      companyName: product.company_name ?? null,
      sortOrder: product.sort_order ?? null,
      assignees,
    })
  }

  return [...products.values()].sort(
    (left, right) =>
      (left.sortOrder ?? Number.MAX_SAFE_INTEGER) - (right.sortOrder ?? Number.MAX_SAFE_INTEGER)
      || left.name.localeCompare(right.name, 'ko'),
  )
}

export function selectApplicationTaskContexts(data: AppData, applicationId: string) {
  return selectProductChangeTaskContexts(data).filter(
    (context) => context.application.id === applicationId,
  )
}

export function selectMyProductChangeTaskContexts(data: AppData, profile: Profile) {
  return selectProductChangeTaskContexts(data)
    .filter(
      ({ task, application }) =>
        application.status === 'published' && task.assignee_id === profile.id,
    )
    .sort((left, right) => {
      if (left.task.status === 'pending' && right.task.status !== 'pending') return -1
      if (left.task.status !== 'pending' && right.task.status === 'pending') return 1
      return left.actionItem.due_date.localeCompare(right.actionItem.due_date)
        || left.task.product_name.localeCompare(right.task.product_name, 'ko')
    })
}

export function calculateChangeProgress(contexts: ProductChangeTaskContext[]) {
  const active = contexts.filter(({ task }) => task.status !== 'cancelled')
  const completed = active.filter(({ task }) => task.status === 'completed').length
  const notApplicable = active.filter(({ task }) => task.status === 'not_applicable').length
  const pending = active.filter(({ task }) => task.status === 'pending').length
  const unassigned = active.filter(({ task }) => task.status === 'pending' && !task.assignee_id).length
  const overdue = active.filter(
    ({ task, actionItem }) => task.status === 'pending' && (daysUntil(actionItem.due_date) ?? 0) < 0,
  ).length
  const processed = completed + notApplicable
  return {
    total: active.length,
    completed,
    notApplicable,
    pending,
    unassigned,
    overdue,
    processed,
    percent: active.length > 0 ? Math.round((processed / active.length) * 100) : 0,
  }
}

export function changeActionLabel(actionItem: ChangeActionItem) {
  return actionItem.kind === 'product_standard'
    ? '제품표준서'
    : `기타${actionItem.custom_kind_name ? ` · ${actionItem.custom_kind_name}` : ''}`
}

export function hasContentLockingProductTask(contexts: ProductChangeTaskContext[]) {
  return contexts.some(({ task }) =>
    task.status === 'completed'
    || task.status === 'not_applicable'
    || task.status === 'cancelled',
  )
}

export function canEditChangeApplication(
  application: ChangeApplication,
  contexts: ProductChangeTaskContext[],
  profile: Profile,
) {
  return application.status !== 'cancelled'
    && (profile.role === 'leader' || application.created_by === profile.id)
    && !application.content_locked_at
    && !hasContentLockingProductTask(contexts)
}
