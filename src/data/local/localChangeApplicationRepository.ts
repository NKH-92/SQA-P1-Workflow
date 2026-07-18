import { recordActivityLog } from '../../lib/activityLog'
import { UserFacingError } from '../../lib/errors'
import { makeId } from '../../lib/format'
import type {
  AppData,
  ChangeActionItem,
  ChangeApplication,
  ProductChangeTask,
} from '../../types'
import type { ChangeApplicationInput } from '../contracts'
import type { ChangeApplicationRepository, RepositoryDeps } from '../repositories/types'
import { selectProductChangeTaskContexts } from '../selectors/changeTaskContexts'
import { CHANGE_APPLICATION_STALE_MESSAGE } from '../validation/changeApplications'

function assertActive(profile: RepositoryDeps['profile']) {
  if (profile.is_active === false || profile.must_change_password === true) {
    throw new UserFacingError('활성 사용자만 변경 적용업무를 처리할 수 있습니다.')
  }
}

function nextChangeNumber(data: AppData, source: ChangeApplicationInput['source']) {
  const prefix = source === 'internal' ? 'INT' : 'ETC'
  const year = new Date().getFullYear()
  let sequence = data.changeApplications.length + 1
  let candidate = `${prefix}-${year}-${String(sequence).padStart(4, '0')}`
  const used = new Set(data.changeApplications.map((item) => item.change_number.toUpperCase()))
  while (used.has(candidate)) {
    sequence += 1
    candidate = `${prefix}-${year}-${String(sequence).padStart(4, '0')}`
  }
  return candidate
}

function productSnapshot(data: AppData, productId: string) {
  const product = data.products.find((item) => item.id === productId)
  const scope = data.changeProductScope.find((item) => item.product_id === productId)
  if (!product && !scope) throw new UserFacingError('제품 정보를 찾을 수 없습니다.')
  return {
    name: product?.name ?? scope!.product_name,
    category: product?.category ?? scope?.category ?? null,
    company_name: product?.company_name ?? scope?.company_name ?? null,
    sort_order: product?.sort_order ?? scope?.sort_order ?? null,
  }
}

function assigneeName(data: AppData, assigneeId: string | null) {
  if (!assigneeId) return null
  return data.changeAssigneeOptions.find((item) => item.id === assigneeId)?.name
    ?? data.profiles.find((item) => item.id === assigneeId)?.name
    ?? null
}

function saveLocalData(
  data: AppData,
  profile: RepositoryDeps['profile'],
  input: ChangeApplicationInput,
  publish: boolean,
  now: string,
) {
  const existing = input.changeApplicationId
    ? data.changeApplications.find((item) => item.id === input.changeApplicationId)
    : null
  if (input.changeApplicationId && !existing) throw new UserFacingError('변경건을 찾을 수 없습니다.')
  if (existing) {
    if (!input.expected_updated_at || input.expected_updated_at !== existing.updated_at) {
      throw new UserFacingError(CHANGE_APPLICATION_STALE_MESSAGE)
    }
    if (existing.status === 'cancelled') throw new UserFacingError('취소된 변경건은 수정할 수 없습니다.')
    if (existing.archived_at) throw new UserFacingError('보관된 변경건은 수정할 수 없습니다. 먼저 복원해 주세요.')
    if (existing.created_by !== profile.id && profile.role !== 'leader') {
      throw new UserFacingError('등록자 또는 파트장만 변경건을 수정할 수 있습니다.')
    }
    if (existing.status === 'published' && !publish) {
      throw new UserFacingError('배포된 변경건은 다시 초안으로 바꿀 수 없습니다.')
    }
    const contexts = selectProductChangeTaskContexts(data).filter(
      (context) => context.application.id === existing.id,
    )
    if (existing.content_locked_at || contexts.some(({ task }) =>
      task.status === 'completed'
      || task.status === 'not_applicable'
       || (task.status === 'cancelled' && task.cancel_kind !== 'scope_removed'))) {
      throw new UserFacingError('한 제품이라도 처리된 뒤에는 변경 내용을 수정할 수 없습니다.')
    }
  }

  const applicationId = existing?.id ?? makeId('change-application')
  const changeNumber = input.change_number || nextChangeNumber(data, input.source)
  const application: ChangeApplication = {
    id: applicationId,
    change_number: changeNumber,
    source: input.source,
    title: input.title,
    summary: input.summary,
    source_url: input.source_url,
    effective_date: input.effective_date,
    status: publish ? 'published' : 'draft',
    content_locked_at: existing?.content_locked_at ?? null,
    archived_at: existing?.archived_at ?? null,
    archived_by: existing?.archived_by ?? null,
    archive_reason: existing?.archive_reason ?? null,
    created_by: existing?.created_by ?? profile.id,
    published_at: publish ? existing?.published_at ?? now : null,
    cancelled_at: null,
    cancellation_reason: null,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    profiles: existing?.profiles ?? { name: profile.name },
  }

  const existingAction = data.changeActionItems
    .filter((item) => item.change_application_id === applicationId)
    .sort((left, right) => left.sort_order - right.sort_order)[0]
  const actionItemId = existingAction?.id ?? makeId('change-action')
  const actionItem: ChangeActionItem = {
    id: actionItemId,
    change_application_id: applicationId,
    kind: input.action_kind,
    custom_kind_name: input.custom_kind_name,
    content: input.action_content,
    due_date: input.due_date,
    sort_order: existingAction?.sort_order ?? 1,
    created_at: existingAction?.created_at ?? now,
    updated_at: now,
  }

  const selected = new Map(input.tasks.map((task) => [task.product_id, task]))
  const existingTasks = new Map(
    data.productChangeTasks
      .filter((task) => task.action_item_id === actionItemId)
      .map((task) => [task.product_id, task]),
  )
  const nextTasks = data.productChangeTasks.map((task) => {
    if (task.action_item_id !== actionItemId) return task
    const draft = selected.get(task.product_id)
    if (!draft) {
      return task.status === 'pending'
        ? {
            ...task,
            status: 'cancelled' as const,
            cancel_kind: 'scope_removed' as const,
            cancelled_at: now,
            cancelled_by: profile.id,
            resolution_reason: '제품 적용 범위 편집에서 제외',
            updated_at: now,
          }
        : task
    }
    if (task.status === 'cancelled') {
      throw new UserFacingError(
        task.cancel_kind === 'scope_removed'
          ? '범위에서 제외된 제품은 사유를 입력해 먼저 복원해 주세요.'
          : '수동 취소된 제품 업무는 다시 활성화할 수 없습니다.',
      )
    }
    const product = productSnapshot(data, task.product_id)
    return {
      ...task,
      product_name: product.name,
      assignee_id: draft.assignee_id,
      assignee_name: assigneeName(data, draft.assignee_id),
      product_note: draft.product_note ?? null,
      status: 'pending' as const,
      completion_note: null,
      resolution_reason: null,
      proxy_reason: null,
      completed_by: null,
      completed_by_name: null,
      completed_at: null,
      updated_at: now,
      products: product,
    }
  })
  for (const draft of input.tasks) {
    if (existingTasks.has(draft.product_id)) continue
    const product = productSnapshot(data, draft.product_id)
    nextTasks.push({
      id: makeId('product-change-task'),
      action_item_id: actionItemId,
      product_id: draft.product_id,
      product_name: product.name,
      assignee_id: draft.assignee_id,
      assignee_name: assigneeName(data, draft.assignee_id),
      status: 'pending',
      product_note: draft.product_note ?? null,
      completion_note: null,
      resolution_reason: null,
      proxy_reason: null,
      completed_by: null,
      completed_by_name: null,
      completed_at: null,
      reopened_by: null,
      reopened_by_name: null,
      reopened_at: null,
      reopen_reason: null,
      created_at: now,
      updated_at: now,
      products: product,
    })
  }

  return {
    applicationId,
    changeNumber,
    data: {
      ...data,
      changeApplications: existing
        ? data.changeApplications.map((item) => (item.id === applicationId ? application : item))
        : [application, ...data.changeApplications],
      changeActionItems: existingAction
        ? data.changeActionItems.map((item) => (item.id === actionItemId ? actionItem : item))
        : [actionItem, ...data.changeActionItems],
      productChangeTasks: nextTasks,
    },
  }
}

export function createLocalChangeApplicationRepository(
  ctx: RepositoryDeps,
): ChangeApplicationRepository {
  const { profile, data, setData } = ctx

  const taskContext = (taskId: string) => {
    const context = selectProductChangeTaskContexts(data).find(({ task }) => task.id === taskId)
    if (!context) throw new UserFacingError('제품 적용업무를 찾을 수 없습니다.')
    return context
  }
  const assertCanProcess = (task: ProductChangeTask, proxyReason: string) => {
    if (task.assignee_id !== profile.id && profile.role !== 'leader') {
      throw new UserFacingError('지정된 담당자만 이 업무를 처리할 수 있습니다.')
    }
    if (task.assignee_id !== profile.id && !proxyReason) {
      throw new UserFacingError('파트장이 대신 처리할 때는 대리 처리 사유가 필요합니다.')
    }
  }
  const willAutoArchive = (
    applicationId: string,
    taskId: string,
    nextStatus: ProductChangeTask['status'],
  ) => {
    const application = data.changeApplications.find((item) => item.id === applicationId)
    if (!application || application.status !== 'published' || application.archived_at) return false
    const contexts = selectProductChangeTaskContexts(data).filter(
      (context) => context.application.id === applicationId,
    )
    return contexts.length > 0
      && ['completed', 'not_applicable'].includes(nextStatus)
      && contexts.every(({ task }) => (task.id === taskId ? nextStatus : task.status) !== 'pending')
  }

  return {
    async saveChangeApplication(input, publish) {
      assertActive(profile)
      const now = new Date().toISOString()
      const result = saveLocalData(data, profile, input, publish, now)
      setData(result.data)
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'change_application',
        entityId: result.applicationId,
        action: publish ? 'published' : 'draft_saved',
        summary: `${profile.name}님이 ${result.changeNumber} 변경 적용업무를 ${publish ? '등록했습니다.' : '초안으로 저장했습니다.'}`,
        metadata: { status: publish ? 'published' : 'draft', task_count: input.tasks.length },
      })
      return result.applicationId
    },

    async completeProductTask(taskId, completionNote, proxyReason) {
      assertActive(profile)
      const { task, application } = taskContext(taskId)
      if (application.status !== 'published' || task.status !== 'pending') {
        throw new UserFacingError('이미 처리되었거나 배포되지 않은 업무입니다.')
      }
      assertCanProcess(task, proxyReason)
      const now = new Date().toISOString()
      const autoArchive = willAutoArchive(application.id, taskId, 'completed')
      setData((current) => ({
        ...current,
        changeApplications: current.changeApplications.map((item) => item.id === application.id ? {
          ...item,
          content_locked_at: item.content_locked_at ?? now,
          archived_at: autoArchive ? now : item.archived_at ?? null,
          archived_by: autoArchive ? null : item.archived_by ?? null,
          archive_origin: autoArchive ? 'automatic' : item.archive_origin ?? null,
          archive_reason: autoArchive ? '모든 제품 적용업무가 처리되어 자동 보관됨' : item.archive_reason ?? null,
          updated_at: now,
        } : item),
        productChangeTasks: current.productChangeTasks.map((item) => item.id === taskId ? {
          ...item,
          status: 'completed',
          completion_note: completionNote || null,
          resolution_reason: null,
          proxy_reason: proxyReason || null,
          completed_by: profile.id,
          completed_by_name: profile.name,
          completed_at: now,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: task.assignee_id,
        entityType: 'product_change_task',
        entityId: taskId,
        action: 'completed',
        summary: `${profile.name}님이 ${task.product_name} 변경 적용을 완료했습니다.`,
        metadata: { completion_note: completionNote || null, proxy_reason: proxyReason || null },
      })
      if (autoArchive) {
        await recordActivityLog(setData, {
          actor: profile,
          entityType: 'change_application',
          entityId: application.id,
          action: 'auto_archived',
          summary: `${application.change_number} 변경건의 모든 제품 적용업무가 처리되어 자동 보관되었습니다.`,
          metadata: { task_id: taskId, final_task_status: 'completed' },
        })
      }
    },

    async markProductTaskNotApplicable(taskId, reason, proxyReason) {
      assertActive(profile)
      const { task, application } = taskContext(taskId)
      if (application.status !== 'published' || task.status !== 'pending') {
        throw new UserFacingError('이미 처리되었거나 배포되지 않은 업무입니다.')
      }
      assertCanProcess(task, proxyReason)
      const now = new Date().toISOString()
      const autoArchive = willAutoArchive(application.id, taskId, 'not_applicable')
      setData((current) => ({
        ...current,
        changeApplications: current.changeApplications.map((item) => item.id === application.id ? {
          ...item,
          content_locked_at: item.content_locked_at ?? now,
          archived_at: autoArchive ? now : item.archived_at ?? null,
          archived_by: autoArchive ? null : item.archived_by ?? null,
          archive_origin: autoArchive ? 'automatic' : item.archive_origin ?? null,
          archive_reason: autoArchive ? '모든 제품 적용업무가 처리되어 자동 보관됨' : item.archive_reason ?? null,
          updated_at: now,
        } : item),
        productChangeTasks: current.productChangeTasks.map((item) => item.id === taskId ? {
          ...item,
          status: 'not_applicable',
          completion_note: null,
          resolution_reason: reason,
          proxy_reason: proxyReason || null,
          completed_by: profile.id,
          completed_by_name: profile.name,
          completed_at: now,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: task.assignee_id,
        entityType: 'product_change_task',
        entityId: taskId,
        action: 'not_applicable',
        summary: `${profile.name}님이 ${task.product_name} 변경 적용을 해당 없음으로 처리했습니다.`,
        metadata: { reason, proxy_reason: proxyReason || null },
      })
      if (autoArchive) {
        await recordActivityLog(setData, {
          actor: profile,
          entityType: 'change_application',
          entityId: application.id,
          action: 'auto_archived',
          summary: `${application.change_number} 변경건의 모든 제품 적용업무가 처리되어 자동 보관되었습니다.`,
          metadata: { task_id: taskId, final_task_status: 'not_applicable' },
        })
      }
    },

    async reopenProductTask(taskId, reason) {
      assertActive(profile)
      const { task, application } = taskContext(taskId)
      if (application.status !== 'published' || !['completed', 'not_applicable'].includes(task.status)) {
        throw new UserFacingError('완료 또는 해당 없음 업무만 다시 열 수 있습니다.')
      }
      if (profile.role !== 'leader' && task.completed_by !== profile.id) {
        throw new UserFacingError('파트장 또는 직전 처리자만 업무를 다시 열 수 있습니다.')
      }
      const now = new Date().toISOString()
      const wasArchived = Boolean(application.archived_at)
      const previous = {
        status: task.status,
        completed_at: task.completed_at,
        completion_note: task.completion_note,
        resolution_reason: task.resolution_reason,
      }
      setData((current) => ({
        ...current,
        changeApplications: current.changeApplications.map((item) => item.id === application.id ? {
          ...item,
          archived_at: null,
          archived_by: null,
          archive_reason: null,
          updated_at: now,
        } : item),
        productChangeTasks: current.productChangeTasks.map((item) => item.id === taskId ? {
          ...item,
          status: 'pending',
          completion_note: null,
          resolution_reason: null,
          proxy_reason: null,
          completed_by: null,
          completed_by_name: null,
          completed_at: null,
          reopened_by: profile.id,
          reopened_by_name: profile.name,
          reopened_at: now,
          reopen_reason: reason,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: task.assignee_id,
        entityType: 'product_change_task',
        entityId: taskId,
        action: 'reopened',
        summary: `${profile.name}님이 ${task.product_name} 변경 적용업무를 다시 열었습니다.`,
        metadata: { ...previous, reason },
      })
      if (wasArchived) {
        await recordActivityLog(setData, {
          actor: profile,
          entityType: 'change_application',
          entityId: application.id,
          action: 'archive_restored_automatically',
          summary: `${profile.name}님이 제품 업무를 다시 열어 ${application.change_number} 변경건의 보관이 자동 해제되었습니다.`,
          metadata: { task_id: taskId, reason },
        })
      }
    },

    async reassignProductTasks(taskIds, assigneeId, reason) {
      assertActive(profile)
      if (profile.role !== 'leader') throw new UserFacingError('파트장만 담당자를 변경할 수 있습니다.')
      const assignee = assigneeId
        ? data.changeAssigneeOptions.find((item) => item.id === assigneeId)
          ?? data.profiles.find((item) => item.id === assigneeId && item.is_active !== false)
        : null
      if (assigneeId && !assignee) throw new UserFacingError('활성 담당자를 선택해 주세요.')
      for (const taskId of taskIds) {
        if (taskContext(taskId).task.status !== 'pending') {
          throw new UserFacingError('미적용 업무만 재배정할 수 있습니다.')
        }
      }
      const now = new Date().toISOString()
      const taskIdSet = new Set(taskIds)
      setData((current) => ({
        ...current,
        productChangeTasks: current.productChangeTasks.map((item) => taskIdSet.has(item.id) ? {
          ...item,
          assignee_id: assigneeId,
          assignee_name: assignee?.name ?? null,
          updated_at: now,
        } : item),
      }))
      for (const taskId of taskIds) {
        const task = taskContext(taskId).task
        await recordActivityLog(setData, {
          actor: profile,
          targetUserId: assigneeId,
          entityType: 'product_change_task',
          entityId: taskId,
          action: 'reassigned',
          summary: `${profile.name}님이 ${task.product_name} 변경 적용 담당자를 변경했습니다.`,
          metadata: { from_assignee_id: task.assignee_id, to_assignee_id: assigneeId, reason },
        })
      }
    },

    async cancelProductTask(taskId, reason) {
      assertActive(profile)
      const { task, application } = taskContext(taskId)
      if (profile.role !== 'leader' && application.created_by !== profile.id) {
        throw new UserFacingError('등록자 또는 파트장만 제품 적용업무를 취소할 수 있습니다.')
      }
      if (task.status !== 'pending') throw new UserFacingError('미적용 업무만 취소할 수 있습니다.')
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        productChangeTasks: current.productChangeTasks.map((item) => item.id === taskId ? {
          ...item,
          status: 'cancelled',
          cancel_kind: 'manual',
          cancelled_at: now,
          cancelled_by: profile.id,
          resolution_reason: reason,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        targetUserId: task.assignee_id,
        entityType: 'product_change_task',
        entityId: taskId,
        action: 'cancelled',
        summary: `${profile.name}님이 ${task.product_name} 변경 적용업무를 취소했습니다.`,
        metadata: { reason },
      })
    },

    async restoreProductChangeScope(taskId, reason) {
      assertActive(profile)
      const { task, application } = taskContext(taskId)
      if (profile.role !== 'leader' && application.created_by !== profile.id) {
        throw new UserFacingError('등록자 또는 파트장만 제품 범위를 복원할 수 있습니다.')
      }
      if (task.status !== 'cancelled' || task.cancel_kind !== 'scope_removed') {
        throw new UserFacingError('범위에서 제외된 제품만 복원할 수 있습니다.')
      }
      if (application.content_locked_at) throw new UserFacingError('처리가 시작된 변경건의 범위는 복원할 수 없습니다.')
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        productChangeTasks: current.productChangeTasks.map((item) => item.id === taskId ? {
          ...item,
          status: 'pending',
          cancel_kind: null,
          cancelled_at: null,
          cancelled_by: null,
          restored_at: now,
          restored_by: profile.id,
          restore_reason: reason,
          resolution_reason: null,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'product_change_task',
        entityId: taskId,
        action: 'scope_restored',
        summary: `${profile.name}님이 ${task.product_name} 제품을 변경 적용범위에 복원했습니다.`,
        metadata: { reason },
      })
    },

    async cancelChangeApplication(changeApplicationId, reason) {
      assertActive(profile)
      const application = data.changeApplications.find((item) => item.id === changeApplicationId)
      if (!application) throw new UserFacingError('변경건을 찾을 수 없습니다.')
      if (profile.role !== 'leader' && application.created_by !== profile.id) {
        throw new UserFacingError('등록자 또는 파트장만 변경건을 취소할 수 있습니다.')
      }
      const contexts = selectProductChangeTaskContexts(data).filter(
        (context) => context.application.id === changeApplicationId,
      )
      if (profile.role !== 'leader' && (application.content_locked_at || contexts.some(({ task }) => ['completed', 'not_applicable'].includes(task.status)))) {
        throw new UserFacingError('처리가 시작된 변경건은 파트장만 취소할 수 있습니다.')
      }
      const now = new Date().toISOString()
      const actionIds = new Set(
        data.changeActionItems
          .filter((item) => item.change_application_id === changeApplicationId)
          .map((item) => item.id),
      )
      setData((current) => ({
        ...current,
        changeApplications: current.changeApplications.map((item) => item.id === changeApplicationId ? {
          ...item,
          status: 'cancelled',
          cancelled_at: now,
          cancellation_reason: reason,
          updated_at: now,
        } : item),
        productChangeTasks: current.productChangeTasks.map((item) => actionIds.has(item.action_item_id) && item.status === 'pending' ? {
          ...item,
          status: 'cancelled',
          cancel_kind: 'application_cancelled',
          cancelled_at: now,
          cancelled_by: profile.id,
          resolution_reason: reason,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'change_application',
        entityId: changeApplicationId,
        action: 'cancelled',
        summary: `${profile.name}님이 ${application.change_number} 변경건을 취소했습니다.`,
        metadata: { reason },
      })
    },

    async archiveChangeApplication(changeApplicationId, reason) {
      assertActive(profile)
      if (profile.role !== 'leader') throw new UserFacingError('파트장만 변경건을 보관할 수 있습니다.')
      const application = data.changeApplications.find((item) => item.id === changeApplicationId)
      if (!application) throw new UserFacingError('변경건을 찾을 수 없습니다.')
      if (application.archived_at) throw new UserFacingError('이미 보관된 변경건입니다.')
      const contexts = selectProductChangeTaskContexts(data).filter(
        (context) => context.application.id === changeApplicationId,
      )
      if (contexts.length === 0) throw new UserFacingError('제품 적용업무가 없는 변경건은 보관할 수 없습니다.')
      if (contexts.some(({ task }) => task.status === 'pending')) {
        throw new UserFacingError('미완료 제품 업무가 남아 있어 보관할 수 없습니다.')
      }
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        changeApplications: current.changeApplications.map((item) => item.id === changeApplicationId ? {
          ...item,
          archived_at: now,
          archived_by: profile.id,
          archive_origin: 'manual',
          archive_reason: reason,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'change_application',
        entityId: changeApplicationId,
        action: 'archived',
        summary: `${profile.name}님이 ${application.change_number} 변경건을 보관했습니다.`,
        metadata: { reason },
      })
    },

    async restoreChangeApplication(changeApplicationId, reason) {
      assertActive(profile)
      if (profile.role !== 'leader') throw new UserFacingError('파트장만 변경건을 복원할 수 있습니다.')
      const application = data.changeApplications.find((item) => item.id === changeApplicationId)
      if (!application) throw new UserFacingError('변경건을 찾을 수 없습니다.')
      if (!application.archived_at) throw new UserFacingError('보관되지 않은 변경건입니다.')
      const now = new Date().toISOString()
      setData((current) => ({
        ...current,
        changeApplications: current.changeApplications.map((item) => item.id === changeApplicationId ? {
          ...item,
          archived_at: null,
          archived_by: null,
          archive_origin: null,
          archive_reason: null,
          updated_at: now,
        } : item),
      }))
      await recordActivityLog(setData, {
        actor: profile,
        entityType: 'change_application',
        entityId: changeApplicationId,
        action: 'restored',
        summary: `${profile.name}님이 ${application.change_number} 변경건을 보관함에서 복원했습니다.`,
        metadata: {
          reason,
          previous_archive_reason: application.archive_reason ?? null,
          previous_archived_at: application.archived_at,
        },
      })
    },
  }
}
