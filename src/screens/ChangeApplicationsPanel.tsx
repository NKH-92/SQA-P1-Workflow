import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCheck,
  CheckCircle2,
  ChevronLeft,
  ClipboardList,
  FilePenLine,
  Filter,
  History,
  Package,
  Plus,
  RotateCcw,
  Search,
  UserRoundCog,
  Users,
  XCircle,
} from 'lucide-react'
import type { MutateFn } from '../app/types'
import { CopyLinkButton } from '../components/ui/CopyLinkButton'
import { Badge, EmptyState, OverflowMenu, Section } from '../components/ui'
import { ChangeActionModal, type ChangeActionDialog, type ChangeActionDialogResult } from '../features/change-applications/components/ChangeActionModal'
import { ChangeApplicationComposer } from '../features/change-applications/components/ChangeApplicationComposer'
import { ChangeApplicationHistory } from '../features/change-applications/components/ChangeApplicationHistory'
import { ChangeFinalizationModal, type ReopenChangeTask } from '../features/change-applications/components/ChangeFinalizationModal'
import {
  canEditChangeApplication,
  changeActionLabel,
  selectChangeApplicationSummary,
  selectProductChangeTaskContexts,
  type ProductChangeTaskContext,
} from '../features/change-applications/selectors'
import { productChangeTaskStatusLabels, type ChangeApplicationInput } from '../features/change-applications/types'
import {
  applicationCreatorName,
  buildMemberProductBoardGroups,
  calculateChangeApplicationKpis,
  changeApplicationWorkflowLabel,
  changeAttentionLabels,
  filterApplicationsByLeaderTab,
  groupChangeTaskContexts,
  isChangeApplicationViewMode,
  isChangeAttentionFilter,
  isChangeTaskStatusFilter,
  isLeaderChangeApplicationTab,
  isMemberChangeApplicationTab,
  matchesChangeAttention,
  type ChangeApplicationViewMode,
  type ChangeAttentionFilter,
  type ChangeTaskStatusFilter,
  type LeaderChangeApplicationTab,
  type MemberChangeApplicationTab,
} from '../features/change-applications/viewModel'
import { useChangeApplicationController } from '../features/change-applications/useChangeApplicationController'
import { useMobileDetail, isMobileDetailViewport } from '../hooks/useMobileDetail'
import { useViewState } from '../hooks/useViewState'
import { useComposerIntent } from '../app/hooks/useComposerIntent'
import { useSelectionHashSync } from '../app/hooks/useHashNavigation'
import { daysUntil, dueDateLabel } from '../lib/dates'
import { formatDate } from '../lib/format'
import { withJosa } from '../lib/korean'
import { canManageTeamData } from '../domain/permissions'
import type {
  AppData,
  ChangeApplication,
  ChangeApplicationHistoryRow,
  ChangeApplicationSummary,
  ProductChangeTask,
  Profile,
} from '../types'

type FinalizationDialog = {
  mode: 'finalize' | 'undo'
  application: ChangeApplication
  summary: ChangeApplicationSummary
  tasks: ProductChangeTask[]
}

const VIEW_MODE_LABELS: Record<ChangeApplicationViewMode, string> = {
  change: '공통변경별',
  product: '제품별',
  assignee: '담당자별',
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function applicationMatchesQuery(
  application: ChangeApplication,
  contexts: ProductChangeTaskContext[],
  query: string,
) {
  const normalized = query.trim().toLocaleLowerCase('ko')
  if (!normalized) return true
  return [
    application.change_number,
    application.title,
    application.summary,
    ...contexts.flatMap(({ task, actionItem }) => [task.product_name, task.assignee_name ?? '', actionItem.content]),
  ].join('\n').toLocaleLowerCase('ko').includes(normalized)
}

/** 다음 화면 그리기 뒤에 포커스를 옮긴다(목록이 다시 보이게 된 직후). */
function focusAfterPaint(find: () => HTMLElement | null | undefined) {
  window.requestAnimationFrame(() => find()?.focus())
}

export function ChangeApplicationsPanel({
  profile,
  data,
  mutate,
  setData,
  initialSelectedId,
  onInitialSelectionApplied,
}: {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: React.Dispatch<React.SetStateAction<AppData>>
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
}) {
  const controller = useChangeApplicationController(profile, data, setData)
  const leaderMode = profile.role === 'leader' || profile.role === 'team_leader'
  const canManageTeam = canManageTeamData(profile)
  const roleKey = leaderMode ? 'leader' : 'member'
  // 보던 조건(탭·보기·검색·필터·선택)은 다른 메뉴에 다녀오거나 새로고침해도 그대로 둔다(토스 CL-3).
  const [leaderTab, setLeaderTab] = useViewState<LeaderChangeApplicationTab>('changes.leader.tab', 'active', isLeaderChangeApplicationTab)
  const [memberTab, setMemberTab] = useViewState<MemberChangeApplicationTab>('changes.member.tab', 'pending', isMemberChangeApplicationTab)
  const [viewMode, setViewMode] = useViewState<ChangeApplicationViewMode>('changes.leader.view', 'change', isChangeApplicationViewMode)
  const [leaderStatusFilter, setLeaderStatusFilter] = useViewState<ChangeTaskStatusFilter>('changes.leader.status', 'all', isChangeTaskStatusFilter)
  const [query, setQuery] = useViewState<string>(`changes.${roleKey}.query`, '', isString)
  const [attention, setAttention] = useViewState<ChangeAttentionFilter>(`changes.${roleKey}.attention`, 'all', isChangeAttentionFilter)
  const [selectedApplicationId, setSelectedApplicationId] = useViewState<string | null>('changes.leader.selected', initialSelectedId ?? null, isNullableString)
  const [selectedMemberProductId, setSelectedMemberProductId] = useViewState<string | null>('changes.member.product', null, isNullableString)
  const statusFilter: ChangeTaskStatusFilter = leaderMode ? leaderStatusFilter : 'pending'
  const [memberDetailOpen, setMemberDetailOpen] = useState(false)
  const [leaderDetailOpen, setLeaderDetailOpen] = useState(false)
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(() => new Set())
  const [composer, setComposer] = useState<{ editingId: string | null } | null>(null)
  const [dialog, setDialog] = useState<ChangeActionDialog | null>(null)
  const [finalizationDialog, setFinalizationDialog] = useState<FinalizationDialog | null>(null)
  const memberDetailRef = useRef<HTMLElement>(null)
  const memberListRef = useRef<HTMLElement>(null)
  const leaderDetailRef = useRef<HTMLDivElement>(null)
  const leaderListRef = useRef<HTMLDivElement>(null)

  const allContexts = useMemo(() => selectProductChangeTaskContexts(data), [data])
  const contextsByApplication = useMemo(() => {
    const result = new Map<string, ProductChangeTaskContext[]>()
    for (const context of allContexts) {
      const current = result.get(context.application.id) ?? []
      current.push(context)
      result.set(context.application.id, current)
    }
    return result
  }, [allContexts])
  const summaryByApplication = useMemo(() => new Map(
    data.changeApplications.flatMap((application) => {
      const summary = selectChangeApplicationSummary(data, application.id)
      return summary ? [[application.id, summary] as const] : []
    }),
  ), [data])

  const finalReviewCount = [...summaryByApplication.values()].filter(
    (summary) => summary.workflow_status === 'final_review_ready',
  ).length
  const ownPendingContexts = allContexts.filter(
    ({ task, application }) => task.assignee_id === profile.id
      && task.status === 'pending'
      && application.status === 'published'
      && !application.final_completed_at
      && !application.archived_at,
  )
  const ownProcessedContexts = allContexts.filter(
    ({ task, application }) => task.assignee_id === profile.id
      && (task.status === 'completed' || task.status === 'not_applicable')
      && application.status === 'published'
      && !application.final_completed_at
      && !application.archived_at,
  )
  const ownProcessingReachedFinalReview = ownProcessedContexts.some(
    ({ application }) => summaryByApplication.get(application.id)?.workflow_status === 'final_review_ready',
  )
  const attentionActive = attention !== 'all'
  const matchesFilters = (context: ProductChangeTaskContext) => {
    if (statusFilter !== 'all' && context.task.status !== statusFilter) return false
    if (!matchesChangeAttention(context, attention)) return false
    return applicationMatchesQuery(context.application, [context], query)
  }
  const baseContexts = leaderMode
    ? allContexts.filter(({ application }) => {
        const workflow = summaryByApplication.get(application.id)?.workflow_status
        return leaderTab === 'final_review'
          ? workflow === 'final_review_ready'
          : workflow === 'draft' || workflow === 'in_progress'
      })
    : ownPendingContexts
  const filteredContexts = baseContexts.filter(matchesFilters)

  const applicationSource = leaderMode
    ? filterApplicationsByLeaderTab(
        data.changeApplications,
        summaryByApplication,
        leaderTab === 'final_review' ? 'final_review' : 'active',
      )
    : data.changeApplications.filter((application) =>
        ownPendingContexts.some((context) => context.application.id === application.id),
      )
  const applications = applicationSource.filter((application) => {
    const contexts = contextsByApplication.get(application.id) ?? []
    if (!applicationMatchesQuery(application, contexts, query)) return false
    if (statusFilter === 'all' && !attentionActive) return true
    return contexts.some((context) => (
      (statusFilter === 'all' || context.task.status === statusFilter)
      && matchesChangeAttention(context, attention)
      && (leaderMode || context.task.assignee_id === profile.id)
    ))
  })

  const selectedApplication = applications.find((application) => application.id === selectedApplicationId)
    ?? applications[0]
    ?? null
  useComposerIntent('change-applications', () => setComposer({ editingId: null }), canManageTeam)
  useSelectionHashSync('change-applications', initialSelectedId ? undefined : selectedApplication?.id ?? null, leaderMode)
  const selectedContexts = selectedApplication ? contextsByApplication.get(selectedApplication.id) ?? [] : []
  const visibleSelectedContexts = attentionActive
    ? selectedContexts.filter((context) => matchesChangeAttention(context, attention))
    : selectedContexts
  const selectedSummary = selectedApplication ? summaryByApplication.get(selectedApplication.id) ?? null : null
  const groupedContexts = viewMode === 'change' ? [] : groupChangeTaskContexts(filteredContexts, viewMode)
  const memberProductGroups = useMemo(() => leaderMode ? [] : buildMemberProductBoardGroups(
    allContexts.filter((context) => (
      context.task.assignee_id === profile.id
      && context.task.status === 'pending'
      && context.application.status === 'published'
      && !context.application.final_completed_at
      && !context.application.archived_at
      && matchesChangeAttention(context, attention)
      && applicationMatchesQuery(context.application, [context], query)
    )),
  ), [allContexts, attention, leaderMode, profile.id, query])
  const selectedMemberProduct = memberProductGroups.find((group) => group.key === selectedMemberProductId)
    ?? memberProductGroups[0]
    ?? null
  const { overdueCount, dueSoonCount, unassignedCount, pendingContexts } = calculateChangeApplicationKpis(allContexts, leaderMode, profile.id)
  const leaderPendingCount = pendingContexts.filter(({ application }) => !application.final_completed_at).length

  const closeMemberDetail = () => {
    setMemberDetailOpen(false)
    focusAfterPaint(() => memberListRef.current?.querySelector<HTMLElement>('[aria-current="true"]'))
  }
  const closeLeaderDetail = () => {
    setLeaderDetailOpen(false)
    focusAfterPaint(() => leaderListRef.current?.querySelector<HTMLElement>('[aria-pressed="true"]'))
  }
  // 좁은 화면: 목록에서 고르면 상세를 화면 위로 가져오고, 뒤로가기는 목록으로 돌아간다.
  useMobileDetail({
    open: !leaderMode && memberTab === 'pending' && memberDetailOpen && Boolean(selectedMemberProduct),
    detailRef: memberDetailRef,
    onBack: closeMemberDetail,
    selectionKey: selectedMemberProduct?.key ?? null,
  })
  useMobileDetail({
    open: leaderMode && leaderTab !== 'history' && viewMode === 'change' && leaderDetailOpen && Boolean(selectedApplication),
    detailRef: leaderDetailRef,
    onBack: closeLeaderDetail,
    selectionKey: selectedApplication?.id ?? null,
  })

  useEffect(() => {
    if (!initialSelectedId) return
    // 링크로 들어온 항목이 저장해 둔 검색어·필터에 가려지지 않게 조건을 비운다.
    setQuery('')
    setAttention('all')
    if (leaderMode) setLeaderStatusFilter('all')
    const summary = summaryByApplication.get(initialSelectedId)
    const historical = summary?.workflow_status === 'completed'
      || summary?.workflow_status === 'cancelled'
      || summary?.workflow_status === 'legacy_completed'
    if (historical) {
      if (leaderMode) setLeaderTab('history')
      else setMemberTab('history')
      setSelectedApplicationId(initialSelectedId)
      return
    }
    if (leaderMode) {
      if (summary?.workflow_status === 'final_review_ready') {
        setLeaderTab('final_review')
      } else {
        setLeaderTab('active')
      }
      setViewMode('change')
      if (isMobileDetailViewport()) setLeaderDetailOpen(true)
    } else {
      setMemberTab('pending')
      const initialContext = allContexts.find(
        ({ application, task }) => application.id === initialSelectedId && task.assignee_id === profile.id,
      )
      if (initialContext) {
        setSelectedMemberProductId(initialContext.task.product_id)
        setMemberDetailOpen(true)
      }
    }
    setSelectedApplicationId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [
    allContexts,
    initialSelectedId,
    leaderMode,
    onInitialSelectionApplied,
    profile.id,
    setAttention,
    setLeaderStatusFilter,
    setLeaderTab,
    setMemberTab,
    setQuery,
    setSelectedApplicationId,
    setSelectedMemberProductId,
    setViewMode,
    summaryByApplication,
  ])

  useEffect(() => {
    if (leaderMode || memberTab !== 'pending') return
    if (selectedMemberProductId && memberProductGroups.some((group) => group.key === selectedMemberProductId)) return
    const fallback = memberProductGroups[0]?.key ?? null
    if (fallback !== selectedMemberProductId) setSelectedMemberProductId(fallback)
  }, [leaderMode, memberProductGroups, memberTab, selectedMemberProductId, setSelectedMemberProductId])

  // 여러 건 선택은 지금 보이는, 담당자를 바꿀 수 있는 업무 안에서만 유효하다.
  const canReassignTask = ({ task, application }: ProductChangeTaskContext) => {
    const workflow = summaryByApplication.get(application.id)?.workflow_status
    if (!canManageTeam || workflow !== 'in_progress') return false
    if (task.status === 'pending') return true
    if (task.status !== 'completed' && task.status !== 'not_applicable') return false
    const assigneeProfile = task.assignee_id ? data.profiles.find((item) => item.id === task.assignee_id) : null
    const assigneeIsActive = Boolean(task.assignee_id) && (assigneeProfile
      ? assigneeProfile.is_active !== false
      : data.changeAssigneeOptions.some((item) => item.id === task.assignee_id))
    return !assigneeIsActive
  }
  const bulkSelectable = leaderMode && canManageTeam && leaderTab !== 'history' && viewMode !== 'change'
  const selectableContexts = bulkSelectable ? filteredContexts.filter(canReassignTask) : []
  const effectiveSelectedTasks = selectableContexts.filter(({ task }) => selectedTaskIds.has(task.id)).map(({ task }) => task)

  const toggleTaskSelection = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current)
      if (checked) next.add(taskId)
      else next.delete(taskId)
      return next
    })
  }
  const toggleGroupSelection = (taskIds: string[], checked: boolean) => {
    setSelectedTaskIds((current) => {
      const next = new Set(current)
      for (const taskId of taskIds) {
        if (checked) next.add(taskId)
        else next.delete(taskId)
      }
      return next
    })
  }

  const showLeaderTab = (tab: LeaderChangeApplicationTab) => {
    setLeaderTab(tab)
    setLeaderDetailOpen(false)
    setSelectedTaskIds(new Set())
    // 요약 칸 조건(기한 지남·담당자 없음)은 진행 중인 미적용 업무에만 뜻이 있다.
    if (tab !== 'active') setAttention('all')
  }

  const toggleAttention = (next: Exclude<ChangeAttentionFilter, 'all'>) => {
    if (attention === next) {
      setAttention('all')
      return
    }
    setAttention(next)
    if (leaderMode) {
      setLeaderTab('active')
      setLeaderDetailOpen(false)
    } else {
      setMemberTab('pending')
    }
  }

  const clearFilters = () => {
    setAttention('all')
    setQuery('')
    if (leaderMode) setLeaderStatusFilter('all')
  }

  const saveComposer = (input: ChangeApplicationInput, publish: boolean) => {
    const editingPublished = Boolean(input.changeApplicationId)
      && data.changeApplications.find((item) => item.id === input.changeApplicationId)?.status === 'published'
    return mutate(async () => {
      const id = await controller.save(input, publish)
      setLeaderTab('active')
      setViewMode('change')
      setSelectedApplicationId(id)
    }, publish
      ? editingPublished ? '공통변경 내용을 저장했어요.' : '공통변경을 배포했어요. 담당자의 미적용 목록에 바로 보여요.'
      : '공통변경을 초안으로 저장했어요. 목록에서 이어서 쓸 수 있어요.')
  }

  const runDialog = (result: ChangeActionDialogResult) => {
    if (!dialog) return Promise.resolve(false)
    if (dialog.kind === 'complete') return mutate(async () => {
      await controller.completeTask(dialog.task.id, result.note, '')
      setMemberTab('pending')
    }, `${dialog.task.product_name} 적용을 완료했어요.`)
    if (dialog.kind === 'complete_all') return mutate(async () => {
      await controller.completeTasks(dialog.tasks.map((task) => task.id), result.note)
      setMemberTab('pending')
    }, `${dialog.productName} 적용 업무 ${dialog.tasks.length}건을 모두 완료했어요.`)
    if (dialog.kind === 'not_applicable') return mutate(async () => {
      await controller.markNotApplicable(dialog.task.id, result.reason, '')
      setMemberTab('pending')
    }, `${withJosa(dialog.task.product_name, '을/를')} 해당 없음으로 처리했어요.`)
    if (dialog.kind === 'reopen') return mutate(async () => {
      await controller.reopenTask(dialog.task.id, result.reason)
      setMemberTab('pending')
    }, `${dialog.task.product_name} 적용 업무를 다시 열었어요.`)
    if (dialog.kind === 'reassign') {
      if (!result.assigneeId) return Promise.resolve(false)
      return mutate(
        () => controller.reassignTasks([dialog.task.id], result.assigneeId!, result.reason),
        `${dialog.task.product_name} 담당자를 바꿨어요.`,
      )
    }
    if (dialog.kind === 'bulk_reassign') {
      if (!result.assigneeId) return Promise.resolve(false)
      return mutate(async () => {
        await controller.reassignTasks(dialog.tasks.map((task) => task.id), result.assigneeId!, result.reason)
        setSelectedTaskIds(new Set())
      }, `적용 업무 ${dialog.tasks.length}건의 담당자를 바꿨어요.`)
    }
    if (dialog.kind === 'remove_scope') return mutate(
      () => controller.removeScope(dialog.task.id, result.reason),
      `${withJosa(dialog.task.product_name, '을/를')} 적용 범위에서 뺐어요.`,
    )
    if (dialog.kind === 'restore_scope') return mutate(
      () => controller.restoreScope(dialog.task.id, result.reason),
      `${withJosa(dialog.task.product_name, '을/를')} 적용 범위에 다시 넣었어요.`,
    )
    if (dialog.kind === 'cancel_application') return mutate(
      () => controller.cancelApplication(dialog.application.id, result.reason),
      `${dialog.application.change_number} 공통변경을 취소했어요.`,
    )
    return Promise.resolve(false)
  }

  const finalize = (application: ChangeApplication, note: string) => mutate(async () => {
    await controller.finalizeApplication(application.id, application.updated_at, note)
    setLeaderTab('history')
    setSelectedApplicationId(null)
    setLeaderDetailOpen(false)
  }, `${application.change_number} 공통변경을 완료했어요. 완료 이력에서 볼 수 있어요.`)

  const undoFinalization = (
    application: ChangeApplication,
    reason: string,
    reopenTasks: ReopenChangeTask[],
  ) => mutate(async () => {
    await controller.undoFinalization(application.id, application.updated_at, reason, reopenTasks)
    setLeaderTab('active')
    setViewMode('change')
    setSelectedApplicationId(application.id)
  }, `${application.change_number} 완료를 취소하고 고른 적용 업무를 다시 열었어요.`)

  const openHistoryUndo = (row: ChangeApplicationHistoryRow) => {
    setFinalizationDialog({
      mode: 'undo',
      application: row,
      summary: row.application_summary,
      tasks: row.product_tasks,
    })
  }

  const taskRow = (context: ProductChangeTaskContext, options: { selectable?: boolean } = {}) => {
    const { task, actionItem, application } = context
    const workflow = summaryByApplication.get(application.id)?.workflow_status
    const canProcess = !leaderMode
      && workflow === 'in_progress'
      && task.status === 'pending'
      && task.assignee_id === profile.id
    const canManage = canManageTeam && workflow === 'in_progress'
    const canReopen = !leaderMode
      && (workflow === 'in_progress' || workflow === 'final_review_ready')
      && (task.status === 'completed' || task.status === 'not_applicable')
      && task.assignee_id === profile.id
    const assigneeProfile = task.assignee_id
      ? data.profiles.find((item) => item.id === task.assignee_id)
      : null
    const assigneeIsActive = Boolean(task.assignee_id) && (assigneeProfile
      ? assigneeProfile.is_active !== false
      : data.changeAssigneeOptions.some((item) => item.id === task.assignee_id))
    const needsRecoveryReassignment = ['completed', 'not_applicable'].includes(task.status)
      && !assigneeIsActive
    const canReassign = canReassignTask(context)
    const pending = task.status === 'pending'
    const overdue = pending && (daysUntil(actionItem.due_date) ?? 0) < 0
    const reassignLabel = needsRecoveryReassignment ? '담당자 다시 배정' : '담당자 변경'
    const selectable = options.selectable && canReassign
    return (
      <article className="change-task-row" data-status={task.status} key={task.id}>
        {selectable && (
          <label className="change-task-select">
            <input
              aria-label={`${task.product_name} · ${application.change_number} 선택`}
              checked={selectedTaskIds.has(task.id)}
              onChange={(event) => toggleTaskSelection(task.id, event.target.checked)}
              type="checkbox"
            />
          </label>
        )}
        <div className="change-task-product"><strong>{task.product_name}</strong><span>{changeActionLabel(actionItem)} · {task.assignee_name ?? '담당자 없음'}{needsRecoveryReassignment ? ' (비활성)' : ''}</span></div>
        <div className="change-task-source"><strong>{application.change_number}</strong><span>{application.title}</span></div>
        <div className={overdue ? 'change-task-due overdue' : 'change-task-due'}>
          <strong>{pending ? dueDateLabel(actionItem.due_date) : formatDate(actionItem.due_date)}</strong>
          <span>{pending ? formatDate(actionItem.due_date) : '적용 기한'}</span>
        </div>
        <div className="change-task-status"><Badge status={task.status}>{task.status === 'cancelled' && task.cancel_kind === 'scope_removed' ? '범위 제외' : productChangeTaskStatusLabels[task.status]}</Badge>{task.completed_at && <small>{formatDate(task.completed_at)}</small>}</div>
        <div className="change-task-actions">
          {canProcess && <><button className="ghost compact" onClick={() => setDialog({ kind: 'not_applicable', task })} type="button">해당 없음</button><button className="primary compact" onClick={() => setDialog({ kind: 'complete', task })} type="button">적용 완료</button></>}
          {canReassign && <button aria-label={`${task.product_name} ${reassignLabel}`} className="icon-button" onClick={() => setDialog({ kind: 'reassign', task })} title={reassignLabel} type="button"><UserRoundCog size={15} /></button>}
          {canManage && pending && <button aria-label={`${task.product_name} 범위에서 빼기`} className="icon-button" onClick={() => setDialog({ kind: 'remove_scope', task })} title="범위에서 빼기" type="button"><XCircle size={15} /></button>}
          {canReopen && <button aria-label={`${task.product_name} 다시 열기`} className="ghost compact" onClick={() => setDialog({ kind: 'reopen', task })} type="button"><RotateCcw size={14} />다시 열기</button>}
          {canManageTeam && task.status === 'cancelled' && task.cancel_kind === 'scope_removed' && !application.content_locked_at && <button aria-label={`${task.product_name} 범위에 다시 넣기`} className="ghost compact" onClick={() => setDialog({ kind: 'restore_scope', task })} type="button">범위에 다시 넣기</button>}
        </div>
        {(task.completion_note || task.resolution_reason || task.reopen_reason) && <p className="change-task-note">{task.completion_note || task.resolution_reason || `다시 연 이유: ${task.reopen_reason}`}</p>}
      </article>
    )
  }

  const memberTaskDetail = ({ task, actionItem, application }: ProductChangeTaskContext) => {
    const workflow = summaryByApplication.get(application.id)?.workflow_status
    const canProcess = workflow === 'in_progress'
      && task.status === 'pending'
      && task.assignee_id === profile.id
    const overdue = (daysUntil(actionItem.due_date) ?? 0) < 0
    return (
      <article className="member-change-detail-card" data-overdue={overdue} key={task.id}>
        <header>
          <div>
            <span>{application.change_number}</span>
            <h3>{application.title}</h3>
          </div>
          <Badge status={overdue ? 'overdue' : task.status}>{dueDateLabel(actionItem.due_date)}</Badge>
        </header>
        <p>{application.summary}</p>
        <div className="member-change-action">
          <span>{changeActionLabel(actionItem)}</span>
          <strong>{actionItem.content}</strong>
        </div>
        <dl>
          <div><dt>시행일</dt><dd>{formatDate(application.effective_date)}</dd></div>
          <div><dt>적용 기한</dt><dd>{formatDate(actionItem.due_date)}</dd></div>
          <div><dt>등록</dt><dd>{applicationCreatorName(data, application)}</dd></div>
        </dl>
        <footer>
          <div>
            <CopyLinkButton tab="change-applications" entityId={application.id} />
            {application.source_url && <a className="ghost compact" href={application.source_url} rel="noreferrer" target="_blank">공식 문서 열기</a>}
          </div>
        </footer>
        {canProcess && (
          // 좁은 화면에서 상세를 열었을 때만 하단에 붙는 처리 버튼 줄이 된다(목록을 볼 때는 하단 탭바를 가리지 않게).
          <div className={memberDetailOpen ? 'member-change-actions mobile-action-bar' : 'member-change-actions'}>
            <button className="ghost" onClick={() => setDialog({ kind: 'not_applicable', task })} type="button">해당 없음</button>
            <button className="primary" onClick={() => setDialog({ kind: 'complete', task })} type="button">적용 완료</button>
          </div>
        )}
      </article>
    )
  }

  const renderDetail = () => {
    if (!selectedApplication || !selectedSummary) return <EmptyState icon={<ClipboardList size={22} />} title="공통변경을 선택해 주세요" />
    const canEdit = canManageTeam && canEditChangeApplication(selectedApplication, selectedContexts, profile)
    const canFinalize = canManageTeam && selectedSummary.workflow_status === 'final_review_ready'
    const canCancel = canManageTeam && selectedApplication.status !== 'cancelled'
    return (
      <>
        <button className="ghost compact change-detail-back" onClick={closeLeaderDetail} type="button"><ChevronLeft size={15} />공통변경 목록</button>
        {selectedSummary.workflow_status === 'final_review_ready' && <div className="change-completion-banner" role="status"><CheckCircle2 size={22} /><span><strong>파트장 최종 확인 대기</strong><small>모든 제품 처리가 끝났어요. 처리 결과를 확인하고 공통변경을 완료해 주세요.</small></span></div>}
        <header className="change-detail-header">
          <div><span>{selectedApplication.change_number}</span><h2 data-detail-title>{selectedApplication.title}</h2><p>{selectedApplication.summary}</p></div>
          <div className="change-detail-actions">
            <CopyLinkButton tab="change-applications" entityId={selectedApplication.id} />
            {canEdit && <button className="ghost compact" onClick={() => setComposer({ editingId: selectedApplication.id })} type="button"><FilePenLine size={14} />{selectedApplication.status === 'draft' ? '초안 이어쓰기' : '내용 수정'}</button>}
            {canFinalize && <button className="primary compact" onClick={() => setFinalizationDialog({ mode: 'finalize', application: selectedApplication, summary: selectedSummary, tasks: selectedContexts.map(({ task }) => task) })} type="button"><CheckCircle2 size={14} />공통변경 완료하기</button>}
            {canCancel && (
              <OverflowMenu
                label={`${selectedApplication.change_number} 더보기`}
                items={[{
                  label: '공통변경 취소',
                  danger: true,
                  icon: <XCircle aria-hidden="true" size={15} />,
                  onSelect: () => setDialog({ kind: 'cancel_application', application: selectedApplication }),
                }]}
              />
            )}
          </div>
        </header>
        <div className="change-detail-meta"><span>등록 <strong>{applicationCreatorName(data, selectedApplication)}</strong></span><span>시행일 <strong>{formatDate(selectedApplication.effective_date)}</strong></span><span>상태 <strong>{changeApplicationWorkflowLabel(selectedSummary.workflow_status)}</strong></span>{selectedApplication.source_url && <a href={selectedApplication.source_url} rel="noreferrer" target="_blank">공식 문서 열기</a>}</div>
        {data.changeActionItems.filter((item) => item.change_application_id === selectedApplication.id).map((item) => <div className="change-action-summary" key={item.id}><Badge>{changeActionLabel(item)}</Badge><strong>{item.content}</strong><span>적용 기한 {formatDate(item.due_date)}</span></div>)}
        <div className="change-detail-progress"><div><strong>{selectedSummary.percent}%</strong><span>{selectedSummary.total_count}개 중 {selectedSummary.processed_count}개 처리</span></div><span className="change-progress"><i style={{ width: `${selectedSummary.percent}%` }} /></span><p>완료 {selectedSummary.completed_count} · 해당 없음 {selectedSummary.not_applicable_count} · 범위 제외 {selectedSummary.scope_removed_count} · 미적용 {selectedSummary.pending_count}</p></div>
        {attentionActive && <p className="change-detail-filter-note">{changeAttentionLabels[attention as Exclude<ChangeAttentionFilter, 'all'>]} 업무 {visibleSelectedContexts.length}건만 보여요.</p>}
        <div className="change-task-table-head"><span>제품 / 적용 항목</span><span>공통변경</span><span>기한</span><span>상태</span><span>처리</span></div>
        <div className="change-task-list">{visibleSelectedContexts.map((context) => taskRow(context))}{visibleSelectedContexts.length === 0 && <EmptyState icon={<Package size={22} />} title="표시할 적용 업무가 없어요" />}</div>
      </>
    )
  }

  const kpiButton = ({
    label,
    icon,
    count,
    pressed,
    tone,
    onClick,
  }: {
    label: string
    icon: React.ReactNode
    count: number
    pressed: boolean
    tone?: 'warning' | 'success'
    onClick: () => void
  }) => (
    <button aria-pressed={pressed} className="kpi-stat" data-tone={count > 0 ? tone : undefined} key={label} onClick={onClick} type="button">
      <span className="kpi-stat-label">{label}{icon}</span>
      <strong className="kpi-stat-value">{count}<span className="unit">건</span></strong>
    </button>
  )

  const filterSummary = attentionActive ? (
    <div className="change-active-filters" role="status">
      <span><Filter aria-hidden="true" size={14} />{changeAttentionLabels[attention as Exclude<ChangeAttentionFilter, 'all'>]} 업무만 보고 있어요</span>
      <button className="ghost compact" onClick={() => setAttention('all')} type="button">필터 해제</button>
    </div>
  ) : null

  const filtersApplied = attentionActive || Boolean(query.trim()) || (leaderMode && statusFilter !== 'all')
  // 목록이 빈 까닭이 검색·필터인지 가린다. 거르기 전에도 없으면(방금 마지막 업무를 처리한 경우 등)
  // ‘조건에 맞는 항목이 없어요’ 대신 지금 상태를 그대로 알려 준다.
  const emptyByFilter = (unfilteredCount: number) => filtersApplied && unfilteredCount > 0
  const clearFiltersAction = filtersApplied
    ? <button className="ghost compact" onClick={clearFilters} type="button">검색·필터 지우기</button>
    : undefined

  const inHistory = (leaderMode && leaderTab === 'history') || (!leaderMode && memberTab === 'history')
  const listTitle = leaderMode
    ? leaderTab === 'final_review' ? '최종 확인 대기' : viewMode === 'change' ? '공통변경 목록' : viewMode === 'product' ? '제품별 적용 업무' : '담당자별 적용 업무'
    : '제품별 미적용 업무'

  return (
    <div className="stack change-applications-page">
      <div className="page-intro change-page-intro">
        <div><h1>변경 적용</h1><p>{leaderMode ? '제품별 처리 결과를 확인하고 공통변경을 최종 완료해요.' : '내 제품에 적용할 공통변경을 처리하고 이력을 확인해요.'}</p></div>
        {canManageTeam && <button className="primary" onClick={() => setComposer({ editingId: null })} type="button"><Plus size={16} />공통변경 등록</button>}
      </div>

      {leaderMode ? (
        <div className="segmented change-primary-tabs" role="tablist" aria-label="공통변경 업무 구분">
          <button aria-selected={leaderTab === 'active'} className={leaderTab === 'active' ? 'selected' : ''} onClick={() => showLeaderTab('active')} role="tab" type="button">진행 중</button>
          <button aria-selected={leaderTab === 'final_review'} className={leaderTab === 'final_review' ? 'selected' : ''} onClick={() => showLeaderTab('final_review')} role="tab" type="button">최종 확인 대기 <Badge>{finalReviewCount}</Badge></button>
          <button aria-selected={leaderTab === 'history'} className={leaderTab === 'history' ? 'selected' : ''} onClick={() => showLeaderTab('history')} role="tab" type="button">완료 이력</button>
        </div>
      ) : (
        <div className="segmented change-primary-tabs member" role="tablist" aria-label="내 공통변경 업무 구분">
          <button aria-selected={memberTab === 'pending'} className={memberTab === 'pending' ? 'selected' : ''} onClick={() => setMemberTab('pending')} role="tab" type="button">내 미적용 <Badge>{ownPendingContexts.length}</Badge></button>
          <button aria-selected={memberTab === 'history'} className={memberTab === 'history' ? 'selected' : ''} onClick={() => setMemberTab('history')} role="tab" type="button">처리 이력</button>
        </div>
      )}

      <div className="kpi-strip change-kpis" role="group" aria-label="적용 업무 요약 · 누르면 목록을 걸러요">
        {leaderMode
          ? kpiButton({
              label: '전체 미적용',
              icon: <ClipboardList size={15} />,
              count: leaderPendingCount,
              pressed: leaderTab === 'active' && !attentionActive && statusFilter === 'pending',
              onClick: () => {
                if (leaderTab === 'active' && !attentionActive && statusFilter === 'pending') {
                  setLeaderStatusFilter('all')
                  return
                }
                showLeaderTab('active')
                setAttention('all')
                setLeaderStatusFilter('pending')
              },
            })
          : kpiButton({
              label: '내 미적용',
              icon: <ClipboardList size={15} />,
              count: ownPendingContexts.length,
              pressed: memberTab === 'pending' && !attentionActive,
              onClick: () => {
                setMemberTab('pending')
                setAttention('all')
              },
            })}
        {kpiButton({ label: changeAttentionLabels.overdue, icon: <AlertTriangle size={15} />, count: overdueCount, pressed: attention === 'overdue', tone: 'warning', onClick: () => toggleAttention('overdue') })}
        {kpiButton({ label: changeAttentionLabels.due_soon, icon: <CalendarClock size={15} />, count: dueSoonCount, pressed: attention === 'due_soon', tone: 'warning', onClick: () => toggleAttention('due_soon') })}
        {leaderMode && kpiButton({ label: '최종 확인 대기', icon: <CheckCircle2 size={15} />, count: finalReviewCount, pressed: leaderTab === 'final_review', tone: 'success', onClick: () => showLeaderTab(leaderTab === 'final_review' ? 'active' : 'final_review') })}
        {leaderMode && kpiButton({ label: changeAttentionLabels.unassigned, icon: <UserRoundCog size={15} />, count: unassignedCount, pressed: attention === 'unassigned', tone: 'warning', onClick: () => toggleAttention('unassigned') })}
      </div>

      {inHistory ? (
        <>
          {!leaderMode && ownProcessedContexts.length > 0 && (
            <>
              <div className="change-completion-banner" role="status">
                <CheckCircle2 size={22} />
                <span>
                  <strong>{ownProcessingReachedFinalReview ? '파트장 최종 확인 대기' : '내 제품 처리 완료'}</strong>
                  <small>{ownProcessingReachedFinalReview
                    ? '모든 제품 처리가 끝났어요. 파트장이 결과를 확인하면 공통변경이 최종 완료돼요.'
                    : '내 처리 결과를 저장했어요. 다른 제품 처리와 파트장의 최종 확인을 기다리고 있어요.'}</small>
                </span>
              </div>
              <Section title="최종 확인 전 처리" icon={<RotateCcw size={18} />} aside={`${ownProcessedContexts.length}건`}>
                <div className="change-task-table-head"><span>제품 / 적용 항목</span><span>공통변경</span><span>기한</span><span>상태</span><span>처리</span></div>
                <div className="change-task-list">{ownProcessedContexts.map((context) => taskRow(context))}</div>
              </Section>
            </>
          )}
          <Section title={leaderMode ? '완료 이력' : '최종 완료 이력'} icon={<History size={18} />}>
            <ChangeApplicationHistory
              data={data}
              profile={profile}
              fetchPage={controller.fetchHistoryPage}
              onUndoCompletion={canManageTeam ? openHistoryUndo : undefined}
              initialSelectedId={initialSelectedId}
              onInitialSelectionApplied={onInitialSelectionApplied}
            />
          </Section>
        </>
      ) : (
        <Section
          title={listTitle}
          icon={leaderMode ? <Filter size={18} /> : <Package size={18} />}
          aside={leaderMode ? `${viewMode === 'change' ? applications.length : filteredContexts.length}건` : `${memberProductGroups.length}개 제품`}
        >
          <div className="change-list-toolbar compact-controls" data-role={roleKey}>
            {leaderMode ? (
              <div className="segmented change-view-tabs" role="group" aria-label="보기 방식">
                {(['change', 'product', 'assignee'] as const).map((mode) => (
                  <button
                    aria-pressed={viewMode === mode}
                    className={viewMode === mode ? 'selected' : ''}
                    key={mode}
                    onClick={() => {
                      setViewMode(mode)
                      setSelectedTaskIds(new Set())
                    }}
                    type="button"
                  >
                    {VIEW_MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
            ) : (
              <div className="member-board-label"><Package size={15} /><span><strong>적용 대상 제품</strong><small>제품을 고르면 공통변경 내용을 볼 수 있어요.</small></span></div>
            )}
            <label className="change-search">
              <Search aria-hidden="true" size={15} />
              <input
                aria-label="변경 적용 검색"
                placeholder={leaderMode ? '공통변경·제품·담당자 검색' : '제품·공통변경 검색'}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            {leaderMode && (
              <select aria-label="업무 상태" value={statusFilter} onChange={(event) => setLeaderStatusFilter(event.target.value as ChangeTaskStatusFilter)}>
                <option value="all">업무 상태 전체</option>
                <option value="pending">미적용</option>
                <option value="completed">적용 완료</option>
                <option value="not_applicable">해당 없음</option>
                <option value="cancelled">취소</option>
              </select>
            )}
          </div>
          {filterSummary}

          {bulkSelectable && effectiveSelectedTasks.length > 0 && (
            <div className="change-bulk-bar" role="region" aria-label="선택한 적용 업무">
              <strong>{effectiveSelectedTasks.length}건 선택</strong>
              <div>
                <button className="ghost compact" onClick={() => setSelectedTaskIds(new Set())} type="button">선택 해제</button>
                <button className="primary compact" onClick={() => setDialog({ kind: 'bulk_reassign', tasks: effectiveSelectedTasks })} type="button"><Users size={14} />선택한 적용 업무 담당자 변경</button>
              </div>
            </div>
          )}

          {!leaderMode ? (
            memberProductGroups.length > 0 && selectedMemberProduct ? (
              <div className="member-product-board" data-detail-open={memberDetailOpen}>
                <nav ref={memberListRef} aria-label="적용대상 제품 목록" className="member-product-list">
                  {memberProductGroups.map((group) => {
                    const selected = selectedMemberProduct.key === group.key
                    const firstTitle = group.items[0]?.application.title ?? ''
                    return (
                      <button
                        aria-current={selected ? 'true' : undefined}
                        className={selected ? 'selected' : ''}
                        data-overdue={group.overdue}
                        key={group.key}
                        onClick={() => {
                          setSelectedMemberProductId(group.key)
                          setMemberDetailOpen(true)
                        }}
                        type="button"
                      >
                        <span><strong>{group.title}</strong><Badge>{group.items.length}건</Badge></span>
                        <p>{firstTitle}{group.items.length > 1 ? ` 외 ${group.items.length - 1}건` : ''}</p>
                        <small>{group.earliestDueDate ? dueDateLabel(group.earliestDueDate) : '기한 없음'} · {group.sub}</small>
                      </button>
                    )
                  })}
                </nav>
                <section ref={memberDetailRef} className="member-product-detail" aria-label={`${selectedMemberProduct.title} 변경관리 내용`}>
                  <button className="ghost compact member-product-back" onClick={closeMemberDetail} type="button"><ChevronLeft size={15} />제품 목록</button>
                  <header>
                    <div><span>적용 대상 제품</span><h2 data-detail-title>{selectedMemberProduct.title}</h2><p>아래 공통변경을 모두 확인하고 제품별로 완료해 주세요.</p></div>
                    <div className="member-product-detail-actions">
                      <Badge>{selectedMemberProduct.items.length}건 남음</Badge>
                      {selectedMemberProduct.items.length > 1 && (
                        <button
                          className="ghost compact"
                          onClick={() => setDialog({
                            kind: 'complete_all',
                            productName: selectedMemberProduct.title,
                            tasks: selectedMemberProduct.items.map(({ task }) => task),
                          })}
                          type="button"
                        >
                          <CheckCheck size={14} />이 제품 모두 적용 완료
                        </button>
                      )}
                    </div>
                  </header>
                  <div className="member-change-detail-list">
                    {selectedMemberProduct.items.map(memberTaskDetail)}
                  </div>
                </section>
              </div>
            ) : (
              <>
                {ownProcessingReachedFinalReview && !emptyByFilter(ownPendingContexts.length) && (
                  <div className="change-completion-banner" role="status">
                    <CheckCircle2 size={22} />
                    <span>
                      <strong>파트장 최종 확인 대기</strong>
                      <small>내 제품 처리를 마쳤어요. 파트장이 전체 결과를 확인하면 공통변경이 최종 완료돼요.</small>
                    </span>
                  </div>
                )}
                <EmptyState
                  icon={<CheckCircle2 size={22} />}
                  title={emptyByFilter(ownPendingContexts.length)
                    ? '조건에 맞는 적용 업무가 없어요'
                    : ownProcessingReachedFinalReview ? '내 제품 처리를 모두 마쳤어요' : '지금 처리할 공통변경이 없어요'}
                  description={emptyByFilter(ownPendingContexts.length) ? '검색어나 필터를 바꿔 보세요.' : undefined}
                  action={emptyByFilter(ownPendingContexts.length) ? clearFiltersAction : undefined}
                />
              </>
            )
          ) : viewMode === 'change' ? (
            <div className="change-overview-layout" data-detail-open={leaderDetailOpen}>
              <div ref={leaderListRef} className="change-application-list" aria-label="공통변경 목록">
                {applications.map((application) => {
                  const summary = summaryByApplication.get(application.id)
                  if (!summary) return null
                  const selected = selectedApplication?.id === application.id
                  return (
                    <button
                      aria-pressed={selected}
                      className={selected ? 'change-application-card selected' : 'change-application-card'}
                      key={application.id}
                      onClick={() => {
                        setSelectedApplicationId(application.id)
                        if (isMobileDetailViewport()) setLeaderDetailOpen(true)
                      }}
                      type="button"
                    >
                      <span className="change-application-card-top"><Badge status={summary.workflow_status}>{changeApplicationWorkflowLabel(summary.workflow_status)}</Badge><span>{application.change_number}</span></span>
                      <strong>{application.title}</strong>
                      <small>{applicationCreatorName(data, application)} · 시행 {formatDate(application.effective_date)}</small>
                      <span className="change-progress-copy">{summary.total_count}개 중 {summary.processed_count}개 처리 · {summary.percent}%</span>
                      <span className="change-progress"><i style={{ width: `${summary.percent}%` }} /></span>
                      <span className="change-card-counts">미적용 {summary.pending_count} · 해당 없음 {summary.not_applicable_count} · 범위 제외 {summary.scope_removed_count}</span>
                    </button>
                  )
                })}
                {applications.length === 0 && (
                  <EmptyState
                    icon={<ClipboardList size={22} />}
                    title={emptyByFilter(applicationSource.length)
                      ? '조건에 맞는 공통변경이 없어요'
                      : leaderTab === 'final_review' ? '최종 확인을 기다리는 공통변경이 없어요' : '진행 중인 공통변경이 없어요'}
                    description={emptyByFilter(applicationSource.length) ? '검색어나 필터를 바꿔 보세요.' : undefined}
                    action={emptyByFilter(applicationSource.length) ? clearFiltersAction : (canManageTeam && leaderTab === 'active'
                      ? <button className="ghost compact" onClick={() => setComposer({ editingId: null })} type="button"><Plus size={14} />공통변경 등록</button>
                      : undefined)}
                  />
                )}
              </div>
              <div ref={leaderDetailRef} className="change-application-detail">{renderDetail()}</div>
            </div>
          ) : (
            <div className="change-group-list">
              {groupedContexts.map((group) => {
                const groupSelectable = bulkSelectable
                  ? group.items.filter(canReassignTask).map(({ task }) => task.id)
                  : []
                const allSelected = groupSelectable.length > 0 && groupSelectable.every((taskId) => selectedTaskIds.has(taskId))
                return (
                  <article className="change-group" data-selectable={bulkSelectable || undefined} key={`${viewMode}-${group.key}`}>
                    <header>
                      <div>
                        {groupSelectable.length > 0 && (
                          <input
                            aria-label={`${group.title} 업무 모두 선택`}
                            checked={allSelected}
                            className="change-group-select"
                            onChange={(event) => toggleGroupSelection(groupSelectable, event.target.checked)}
                            type="checkbox"
                          />
                        )}
                        {viewMode === 'product' ? <Package size={17} /> : <Users size={17} />}
                        <span><strong>{group.title}</strong><small>{group.sub}</small></span>
                      </div>
                      <Badge>{group.items.length}건</Badge>
                    </header>
                    <div className="change-task-table-head"><span>제품 / 적용 항목</span><span>공통변경</span><span>기한</span><span>상태</span><span>처리</span></div>
                    <div className="change-task-list">{group.items.map((context) => taskRow(context, { selectable: bulkSelectable }))}</div>
                  </article>
                )
              })}
              {groupedContexts.length === 0 && (
                <EmptyState
                  icon={<Package size={22} />}
                  title={emptyByFilter(baseContexts.length)
                    ? '조건에 맞는 적용 업무가 없어요'
                    : leaderTab === 'final_review' ? '최종 확인을 기다리는 적용 업무가 없어요' : '진행 중인 적용 업무가 없어요'}
                  description={emptyByFilter(baseContexts.length) ? '검색어나 필터를 바꿔 보세요.' : undefined}
                  action={emptyByFilter(baseContexts.length) ? clearFiltersAction : undefined}
                />
              )}
            </div>
          )}
        </Section>
      )}

      {composer && <ChangeApplicationComposer data={data} profile={profile} editingApplicationId={composer.editingId} onClose={() => setComposer(null)} onSave={saveComposer} onOpenExisting={(id) => { setComposer(null); setSelectedApplicationId(id) }} />}
      {dialog && <ChangeActionModal dialog={dialog} data={data} onClose={() => setDialog(null)} onConfirm={runDialog} />}
      {finalizationDialog && <ChangeFinalizationModal mode={finalizationDialog.mode} application={finalizationDialog.application} summary={finalizationDialog.summary} tasks={finalizationDialog.tasks} assignees={data.changeAssigneeOptions.filter((assignee) => data.profiles.find((item) => item.id === assignee.id)?.is_active !== false)} onClose={() => setFinalizationDialog(null)} onFinalize={(note) => finalize(finalizationDialog.application, note)} onUndo={(reason, reopenTasks) => undoFinalization(finalizationDialog.application, reason, reopenTasks)} />}
    </div>
  )
}
