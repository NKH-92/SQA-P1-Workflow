import type {
  ChangeActionItem,
  ChangeApplication,
  ChangeApplicationSummary,
  ChangeApplicationWorkflowStatus,
  ChangeAssigneeOption,
  ProductChangeTask,
  Profile,
  Role,
} from '../../types'
import type { ChangeApplicationFeatureData } from './types'
import { daysUntil } from '../../lib/dates'
import {
  selectProductChangeTaskContexts,
  type ProductChangeTaskContext,
} from '../../domain/changeApplications/taskContexts'
import {
  selectOrBuildChangeApplicationSummary,
  summarizeProductTaskCompletion,
} from '../../domain/changeApplications/completion'

export { selectProductChangeTaskContexts, type ProductChangeTaskContext }

export type ChangeScopeProduct = {
  id: string
  name: string
  category: string | null
  companyName: string | null
  sortOrder: number | null
  assignees: Array<{ id: string; name: string }>
}

export function selectChangeScopeProducts(data: ChangeApplicationFeatureData): ChangeScopeProduct[] {
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

export function selectApplicationTaskContexts(data: ChangeApplicationFeatureData, applicationId: string) {
  return selectProductChangeTaskContexts(data).filter(
    (context) => context.application.id === applicationId,
  )
}

export function selectChangeApplicationSummary(data: ChangeApplicationFeatureData, applicationId: string) {
  const application = data.changeApplications.find((item) => item.id === applicationId)
  if (!application) return null
  let hasInactiveAssignee = false
  const tasks = selectApplicationTaskContexts(data, applicationId).map(({ task }) => {
    if (!task.assignee_id) return task
    const profile = data.profiles.find((item) => item.id === task.assignee_id)
    const isActive = profile
      ? profile.is_active !== false
      : data.changeAssigneeOptions.some((item) => item.id === task.assignee_id)
    if (isActive) return task
    hasInactiveAssignee = true
    return { ...task, assignee_id: null }
  })
  return selectOrBuildChangeApplicationSummary(
    application,
    tasks,
    hasInactiveAssignee ? [] : data.changeApplicationSummaries ?? [],
  )
}

/**
 * 여러 공통변경의 요약을 한 번에 만든다. 규칙은 selectChangeApplicationSummary와 같다
 * (비활성 담당자는 담당자 없음으로 보고, 그런 업무가 있으면 서버 요약을 쓰지 않는다).
 * 적용 업무 묶음·프로필·서버 요약을 한 번만 훑어, 신청서마다 전체 업무를 다시 훑지 않는다.
 */
export function selectChangeApplicationSummaries(data: ChangeApplicationFeatureData) {
  const tasksByApplication = new Map<string, ProductChangeTask[]>()
  for (const { task, application } of selectProductChangeTaskContexts(data)) {
    const current = tasksByApplication.get(application.id)
    if (current) current.push(task)
    else tasksByApplication.set(application.id, [task])
  }
  // find()와 같게 같은 id가 여러 번 있으면 처음 것을 쓴다.
  const profilesById = new Map<string, Profile>()
  for (const profile of data.profiles) {
    if (!profilesById.has(profile.id)) profilesById.set(profile.id, profile)
  }
  const assigneeOptionIds = new Set(data.changeAssigneeOptions.map((item) => item.id))
  const serverSummaries = new Map<string, ChangeApplicationSummary>()
  for (const summary of data.changeApplicationSummaries ?? []) {
    if (!serverSummaries.has(summary.change_application_id)) serverSummaries.set(summary.change_application_id, summary)
  }

  const result = new Map<string, ChangeApplicationSummary>()
  for (const application of data.changeApplications) {
    if (result.has(application.id)) continue
    let hasInactiveAssignee = false
    const tasks = (tasksByApplication.get(application.id) ?? []).map((task) => {
      if (!task.assignee_id) return task
      const profile = profilesById.get(task.assignee_id)
      const isActive = profile ? profile.is_active !== false : assigneeOptionIds.has(task.assignee_id)
      if (isActive) return task
      hasInactiveAssignee = true
      return { ...task, assignee_id: null }
    })
    const serverSummary = hasInactiveAssignee ? undefined : serverSummaries.get(application.id)
    result.set(application.id, selectOrBuildChangeApplicationSummary(application, tasks, serverSummary ? [serverSummary] : []))
  }
  return result
}

/** 공통변경 적용 업무를 맡아 처리할 수 있는 역할인지. 팀장(읽기 전용)은 서버가 쓰기를 모두 막아 처리할 수 없다. */
export function canHoldChangeTask(person: { role: Role }) {
  return person.role !== 'team_leader'
}

/**
 * 적용 업무 담당자로 고를 수 있는 사람(활성 사용자 중 팀장 제외).
 * 이름 찾기·활성 판정은 전체 목록(changeAssigneeOptions)을 그대로 쓴다.
 */
export function selectAssignableChangeAssignees(
  data: Pick<ChangeApplicationFeatureData, 'changeAssigneeOptions' | 'profiles'>,
): ChangeAssigneeOption[] {
  return data.changeAssigneeOptions.filter((item) => (
    canHoldChangeTask(item)
    && data.profiles.find((profileItem) => profileItem.id === item.id)?.is_active !== false
  ))
}

/**
 * 담당자 본인이 자기 적용 업무를 적용 완료·해당 없음으로 처리할 수 있는지.
 * 서버(complete/mark_not_applicable)처럼 역할이 아니라 담당자 본인인지를 본다(파트장도 본인 업무는 처리).
 */
export function canProcessOwnChangeTask(
  profile: Pick<Profile, 'id' | 'role'>,
  task: Pick<ProductChangeTask, 'status' | 'assignee_id'>,
  workflow: ChangeApplicationWorkflowStatus | undefined,
) {
  return canHoldChangeTask(profile)
    && workflow === 'in_progress'
    && task.status === 'pending'
    && task.assignee_id === profile.id
}

/** 담당자 본인이 처리한 적용 업무를 최종 완료 전에 다시 열 수 있는지(서버 reopen과 같은 기준). */
export function canReopenOwnChangeTask(
  profile: Pick<Profile, 'id' | 'role'>,
  task: Pick<ProductChangeTask, 'status' | 'assignee_id'>,
  workflow: ChangeApplicationWorkflowStatus | undefined,
) {
  return canHoldChangeTask(profile)
    && (workflow === 'in_progress' || workflow === 'final_review_ready')
    && (task.status === 'completed' || task.status === 'not_applicable')
    && task.assignee_id === profile.id
}

export function selectMyProductChangeTaskContexts(data: ChangeApplicationFeatureData, profile: Profile) {
  return selectProductChangeTaskContexts(data)
    .filter(
      ({ task, application }) =>
        application.status === 'published' && !application.archived_at && task.assignee_id === profile.id,
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
  const completion = summarizeProductTaskCompletion(active.map(({ task }) => task))
  const unassigned = active.filter(({ task }) => task.status === 'pending' && !task.assignee_id).length
  const overdue = active.filter(
    ({ task, actionItem }) => task.status === 'pending' && (daysUntil(actionItem.due_date) ?? 0) < 0,
  ).length
  return {
    ...completion,
    unassigned,
    overdue,
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
    && !application.archived_at
    && profile.role === 'leader'
    && !application.content_locked_at
    && !hasContentLockingProductTask(contexts)
}
