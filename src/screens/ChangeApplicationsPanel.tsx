import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FilePenLine,
  Filter,
  History,
  Package,
  Plus,
  RefreshCw,
  Search,
  UserRoundCog,
  Users,
  XCircle,
} from 'lucide-react'
import type { MutateFn } from '../app/types'
import { CopyLinkButton } from '../components/ui/CopyLinkButton'
import { Badge, EmptyState, Section } from '../components/ui'
import { ChangeActionModal, type ChangeActionDialog, type ChangeActionDialogResult } from '../features/change-applications/components/ChangeActionModal'
import { ChangeApplicationComposer } from '../features/change-applications/components/ChangeApplicationComposer'
import {
  calculateChangeProgress,
  canEditChangeApplication,
  changeActionLabel,
  selectApplicationTaskContexts,
  selectProductChangeTaskContexts,
  type ProductChangeTaskContext,
} from '../features/change-applications/selectors'
import {
  productChangeTaskStatusLabels,
  type ChangeApplicationInput,
} from '../features/change-applications/types'
import {
  applicationCreatorName,
  applicationStatusLabel,
  calculateChangeApplicationKpis,
  changeApplicationActionItemKey,
  filterChangeApplications,
  filterChangeTaskContexts,
  groupChangeTaskContexts,
  mergeProductChangeTasks,
  type ChangeActionKindFilter,
  type ChangeApplicationArchiveFilter,
  type ChangeApplicationStatusFilter,
  type ChangeApplicationViewMode,
  type ChangeAttentionFilter,
  type ChangeTaskStatusFilter,
} from '../features/change-applications/viewModel'
import { useChangeApplicationController } from '../features/change-applications/useChangeApplicationController'
import { hasFullyAppliedArchiveSignal } from '../domain/changeApplications/completion'
import { daysUntil, dueDateLabel } from '../lib/dates'
import { formatDate } from '../lib/format'
import type {
  AppData,
  ProductChangeTask,
  Profile,
} from '../types'

type HistoryCacheEntry = {
  actionItemKey: string
  tasks: ProductChangeTask[]
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
  const leaderMode = profile.role === 'leader'
  const [viewMode, setViewMode] = useState<ChangeApplicationViewMode>(leaderMode ? 'change' : 'product')
  const [statusFilter, setStatusFilter] = useState<ChangeTaskStatusFilter>(leaderMode ? 'all' : 'pending')
  const [applicationFilter, setApplicationFilter] = useState<ChangeApplicationStatusFilter>(leaderMode ? 'all' : 'published')
  const [archiveFilter, setArchiveFilter] = useState<ChangeApplicationArchiveFilter>('active')
  const [actionKindFilter, setActionKindFilter] = useState<ChangeActionKindFilter>('all')
  const [attentionFilter, setAttentionFilter] = useState<ChangeAttentionFilter>('all')
  const [query, setQuery] = useState('')
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(initialSelectedId ?? null)
  const [composer, setComposer] = useState<{ editingId: string | null } | null>(null)
  const [dialog, setDialog] = useState<ChangeActionDialog | null>(null)
  const [historyLoadingId, setHistoryLoadingId] = useState<string | null>(null)
  const [historyCache, setHistoryCache] = useState<Record<string, HistoryCacheEntry>>({})
  const [historyError, setHistoryError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialSelectedId) return
    setSelectedApplicationId(initialSelectedId)
    setViewMode('change')
    setStatusFilter('all')
    setActionKindFilter('all')
    setAttentionFilter('all')
    const application = data.changeApplications.find((item) => item.id === initialSelectedId)
    if (application) {
      setApplicationFilter(application.status)
      setArchiveFilter(application.archived_at ? 'archived' : 'active')
    }
    onInitialSelectionApplied?.()
  }, [data.changeApplications, initialSelectedId, onInitialSelectionApplied])

  const retainedHistoryTasks = useMemo(
    () => Object.entries(historyCache).flatMap(([applicationId, entry]) =>
      entry.actionItemKey === changeApplicationActionItemKey(data, applicationId) ? entry.tasks : []),
    [data, historyCache],
  )
  const panelData = useMemo(() => {
    if (retainedHistoryTasks.length === 0) return data
    return {
      ...data,
      // A normal parent refresh intentionally drops old closed rows. Retain rows
      // explicitly loaded for this mounted panel, while preferring refreshed rows
      // when the same task is still part of the capped response.
      productChangeTasks: mergeProductChangeTasks(data.productChangeTasks, retainedHistoryTasks, false),
    }
  }, [data, retainedHistoryTasks])
  const remoteHistoryIsCapped = controller.historyIsCapped
  const isHistoryLoaded = (applicationId: string) => {
    const cached = historyCache[applicationId]
    return Boolean(
      cached
      && cached.actionItemKey === changeApplicationActionItemKey(data, applicationId),
    )
  }

  const allContexts = useMemo(() => selectProductChangeTaskContexts(panelData), [panelData])
  const completionByApplicationId = useMemo(() => {
    return new Map(data.changeApplications.map((application) => {
      const contexts = selectApplicationTaskContexts(panelData, application.id)
      const cached = historyCache[application.id]
      const hasExactHistory = !remoteHistoryIsCapped || Boolean(
        cached
        && cached.actionItemKey === changeApplicationActionItemKey(data, application.id),
      )
      const progress = calculateChangeProgress(contexts)
      return [application.id, {
        fullyApplied: hasFullyAppliedArchiveSignal(application) || (hasExactHistory && progress.allApplied),
        progress,
      }] as const
    }))
  }, [data, historyCache, panelData, remoteHistoryIsCapped])
  const fullyAppliedApplications = useMemo(
    () => data.changeApplications
      .filter((application) => application.status === 'published' && completionByApplicationId.get(application.id)?.fullyApplied)
      .sort((left, right) => (right.archived_at ?? right.updated_at).localeCompare(left.archived_at ?? left.updated_at)),
    [completionByApplicationId, data.changeApplications],
  )
  const scopedContexts = useMemo(
    () => leaderMode
      ? allContexts
      : allContexts.filter(({ task, application }) => task.assignee_id === profile.id || application.created_by === profile.id),
    [allContexts, leaderMode, profile.id],
  )
  const taskContexts = useMemo(() => {
    return filterChangeTaskContexts(scopedContexts, {
      status: statusFilter,
      application: applicationFilter,
      archive: archiveFilter,
      actionKind: actionKindFilter,
      attention: attentionFilter,
      query,
    })
  }, [actionKindFilter, applicationFilter, archiveFilter, attentionFilter, query, scopedContexts, statusFilter])

  const applications = useMemo(() => {
    return filterChangeApplications(data.changeApplications, taskContexts, {
      status: statusFilter,
      application: applicationFilter,
      archive: archiveFilter,
      actionKind: actionKindFilter,
      attention: attentionFilter,
      query,
    }, leaderMode, profile.id)
  }, [actionKindFilter, applicationFilter, archiveFilter, attentionFilter, data.changeApplications, leaderMode, profile.id, query, statusFilter, taskContexts])

  const {
    pendingContexts,
    overdueCount,
    dueSoonCount,
    unassignedCount,
    completedCount,
  } = calculateChangeApplicationKpis(allContexts, leaderMode, profile.id)

  const selectedApplication = applications.find((item) => item.id === selectedApplicationId)
    ?? applications[0]
    ?? null
  const selectedContexts = selectedApplication
    ? selectApplicationTaskContexts(panelData, selectedApplication.id)
    : []

  const openApplication = (applicationId: string) => {
    const application = data.changeApplications.find((item) => item.id === applicationId)
    setSelectedApplicationId(applicationId)
    setViewMode('change')
    setStatusFilter('all')
    setActionKindFilter('all')
    setAttentionFilter('all')
    if (application) {
      setApplicationFilter(application.status)
      setArchiveFilter(application.archived_at ? 'archived' : 'active')
    }
  }

  const showFullyAppliedApplications = () => {
    setViewMode('change')
    setStatusFilter('all')
    setApplicationFilter('published')
    setArchiveFilter('all')
    setActionKindFilter('all')
    setAttentionFilter('all')
    setQuery('')
    setSelectedApplicationId(fullyAppliedApplications[0]?.id ?? null)
  }

  const loadFullHistory = async () => {
    if (!selectedApplication || historyLoadingId) return
    const actionItemIds = data.changeActionItems
      .filter((item) => item.change_application_id === selectedApplication.id)
      .map((item) => item.id)
    const applicationId = selectedApplication.id
    const actionItemKey = [...actionItemIds].sort().join('|')
    setHistoryLoadingId(applicationId)
    setHistoryError(null)
    try {
      const history = await controller.fetchHistory(actionItemIds)
      setHistoryCache((current) => ({
        ...current,
        [applicationId]: { actionItemKey, tasks: history },
      }))
      setData((current) => {
        return {
          ...current,
          productChangeTasks: mergeProductChangeTasks(current.productChangeTasks, history, true),
        }
      })
    } catch {
      setHistoryError('전체 완료 이력을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.')
    } finally {
      setHistoryLoadingId(null)
    }
  }

  const saveComposer = (input: ChangeApplicationInput, publish: boolean) => mutate(async () => {
    const id = await controller.save(input, publish)
    setSelectedApplicationId(id)
    setViewMode('change')
    setStatusFilter('all')
    setActionKindFilter('all')
    setAttentionFilter('all')
    setArchiveFilter('active')
    setApplicationFilter(publish ? 'published' : 'draft')
  }, publish ? '변경 적용업무를 등록했습니다.' : '변경 적용업무 초안을 저장했습니다.')

  const runDialog = (result: ChangeActionDialogResult) => {
    if (!dialog) return Promise.resolve(false)
    if (dialog.kind === 'complete') {
      return mutate(
        () => controller.completeTask(dialog.task.id, result.note, result.proxyReason),
        `${dialog.task.product_name} 적용업무를 완료했습니다.`,
      )
    }
    if (dialog.kind === 'not_applicable') {
      return mutate(
        () => controller.markNotApplicable(dialog.task.id, result.reason, result.proxyReason),
        `${dialog.task.product_name} 적용업무를 해당 없음으로 처리했습니다.`,
      )
    }
    if (dialog.kind === 'reopen') {
      return mutate(
        () => controller.reopenTask(dialog.task.id, result.reason),
        `${dialog.task.product_name} 적용업무를 다시 열었습니다.`,
      )
    }
    if (dialog.kind === 'reassign') {
      return mutate(
        () => controller.reassignTasks([dialog.task.id], result.assigneeId, result.reason),
        `${dialog.task.product_name} 적용 책임자를 변경했습니다.`,
      )
    }
    if (dialog.kind === 'cancel_task') {
      return mutate(
        () => controller.cancelTask(dialog.task.id, result.reason),
        `${dialog.task.product_name} 적용업무를 취소했습니다.`,
      )
    }
    if (dialog.kind === 'archive_application') {
      return mutate(
        () => controller.archiveApplication(dialog.application.id, result.reason),
        `${dialog.application.change_number} 변경건을 보관했습니다.`,
      )
    }
    if (dialog.kind === 'restore_application') {
      return mutate(
        () => controller.restoreApplication(dialog.application.id, result.reason),
        `${dialog.application.change_number} 변경건을 활성 목록으로 복원했습니다.`,
      )
    }
    if (dialog.kind === 'restore_scope') {
      return mutate(
        () => controller.restoreScope(dialog.task.id, result.reason),
        `${dialog.task.product_name} 제품을 변경 적용범위에 복원했습니다.`,
      )
    }
    return mutate(
      () => controller.cancelApplication(dialog.application.id, result.reason),
      `${dialog.application.change_number} 변경건을 취소했습니다.`,
    )
  }

  const taskRow = ({ task, actionItem, application }: ProductChangeTaskContext) => {
    const canProcess = application.status === 'published'
      && !application.archived_at
      && task.status === 'pending'
      && (leaderMode || task.assignee_id === profile.id)
    const canReopen = application.status === 'published'
      && ['completed', 'not_applicable'].includes(task.status)
      && (leaderMode || task.completed_by === profile.id)
    const canManageTask = application.status === 'published'
      && !application.archived_at
      && task.status === 'pending'
      && (leaderMode || application.created_by === profile.id)
    const canRestoreScope = task.status === 'cancelled'
      && task.cancel_kind === 'scope_removed'
      && !application.content_locked_at
      && (leaderMode || application.created_by === profile.id)
    const days = daysUntil(actionItem.due_date)
    const overdue = task.status === 'pending' && days != null && days < 0
    const assigneeInactive = Boolean(
      task.assignee_id
      && data.profiles.find((item) => item.id === task.assignee_id)?.is_active === false,
    )
    return (
      <article className="change-task-row" data-status={task.status} key={task.id}>
        <div className="change-task-product">
          <strong>{task.product_name}</strong>
          <span>{changeActionLabel(actionItem)} · {task.assignee_name ?? '담당 미지정'}</span>
          {assigneeInactive && <Badge status="withdrawn">담당자 비활성 · 재배정 필요</Badge>}
        </div>
        <div className="change-task-source">
          <strong>{application.change_number}</strong>
          <span>{application.title}</span>
        </div>
        <div className={overdue ? 'change-task-due overdue' : 'change-task-due'}>
          <strong>{dueDateLabel(actionItem.due_date)}</strong>
          <span>{formatDate(actionItem.due_date)}</span>
        </div>
        <div className="change-task-status">
          <Badge status={task.status}>
            {task.status === 'cancelled' && task.cancel_kind === 'scope_removed'
              ? '범위 제외'
              : productChangeTaskStatusLabels[task.status]}
          </Badge>
          {task.completed_at && <small>{formatDate(task.completed_at)}</small>}
        </div>
        <div className="change-task-actions">
          {canProcess && (
            <>
              <button className="ghost compact" onClick={() => setDialog({ kind: 'not_applicable', task })} type="button">해당 없음</button>
              <button className="primary compact" onClick={() => setDialog({ kind: 'complete', task })} type="button">적용 완료</button>
            </>
          )}
          {leaderMode && application.status === 'published' && !application.archived_at && task.status === 'pending' && (
            <button aria-label={`${task.product_name} 담당자 변경`} className="icon-button" onClick={() => setDialog({ kind: 'reassign', task })} title="담당자 변경" type="button"><UserRoundCog size={15} /></button>
          )}
          {canManageTask && (
            <button aria-label={`${task.product_name} 업무 취소`} className="icon-button" onClick={() => setDialog({ kind: 'cancel_task', task })} title="업무 취소" type="button"><XCircle size={15} /></button>
          )}
          {canReopen && <button className="ghost compact" onClick={() => setDialog({ kind: 'reopen', task })} type="button"><RefreshCw size={14} />재개</button>}
          {canRestoreScope && (
            <button
              className="ghost compact"
              onClick={() => setDialog({ kind: 'restore_scope', task })}
              type="button"
            >
              <RefreshCw size={14} />범위 복원
            </button>
          )}
        </div>
        {(task.completion_note || task.resolution_reason || task.reopen_reason) && (
          <p className="change-task-note">{task.completion_note || task.resolution_reason || `재개: ${task.reopen_reason}`}</p>
        )}
      </article>
    )
  }

  const groupedContexts = useMemo(() => {
    if (viewMode === 'change') return []
    return groupChangeTaskContexts(taskContexts, viewMode)
  }, [taskContexts, viewMode])

  return (
    <div className="stack change-applications-page">
      <div className="page-intro change-page-intro">
        <div>
          <h1>변경 적용</h1>
          <p>
            {leaderMode ? '제품별 누락과 담당 공백을 변경건 단위로 확인합니다.' : '내 제품에 배정된 변경사항을 적용하고 완료 이력을 남깁니다.'}
          </p>
        </div>
        <button className="primary" onClick={() => setComposer({ editingId: null })} type="button"><Plus size={16} />적용업무 등록</button>
      </div>

      <div className="kpi-strip change-kpis">
        <button className="kpi-stat" onClick={() => { setStatusFilter('pending'); setApplicationFilter('published'); setArchiveFilter('active'); setAttentionFilter('all') }} type="button">
          <span className="kpi-stat-label">{leaderMode ? '전체 미적용' : '내 미적용'}<ClipboardList size={15} /></span>
          <strong className="kpi-stat-value">{pendingContexts.length}<span className="unit">건</span></strong>
        </button>
        <button className="kpi-stat" data-tone={overdueCount > 0 ? 'warning' : undefined} onClick={() => { setStatusFilter('pending'); setApplicationFilter('published'); setArchiveFilter('active'); setAttentionFilter('overdue') }} type="button">
          <span className="kpi-stat-label">기한 초과<AlertTriangle size={15} /></span>
          <strong className="kpi-stat-value">{overdueCount}<span className="unit">건</span></strong>
        </button>
        <button className="kpi-stat" data-tone={dueSoonCount > 0 ? 'warning' : undefined} onClick={() => { setStatusFilter('pending'); setApplicationFilter('published'); setArchiveFilter('active'); setAttentionFilter('due_soon') }} type="button">
          <span className="kpi-stat-label">D-3 이내<CalendarClock size={15} /></span>
          <strong className="kpi-stat-value">{dueSoonCount}<span className="unit">건</span></strong>
        </button>
        {leaderMode ? (
          <>
            <button className="kpi-stat" data-tone={unassignedCount > 0 ? 'warning' : undefined} onClick={() => { setViewMode('assignee'); setStatusFilter('pending'); setApplicationFilter('published'); setArchiveFilter('active'); setAttentionFilter('unassigned') }} type="button">
              <span className="kpi-stat-label">담당 미지정<Users size={15} /></span>
              <strong className="kpi-stat-value">{unassignedCount}<span className="unit">건</span></strong>
            </button>
            <button className="kpi-stat" data-tone="success" onClick={showFullyAppliedApplications} type="button">
              <span className="kpi-stat-label">완료된 변경<CheckCircle2 size={15} /></span>
              <strong className="kpi-stat-value">{fullyAppliedApplications.length}<span className="unit">건</span></strong>
            </button>
          </>
        ) : (
          <button className="kpi-stat" onClick={() => { setStatusFilter('completed'); setApplicationFilter('published'); setArchiveFilter('active'); setAttentionFilter('all') }} type="button">
            <span className="kpi-stat-label">완료 이력<CheckCircle2 size={15} /></span>
            <strong className="kpi-stat-value">{completedCount}<span className="unit">건</span></strong>
          </button>
        )}
      </div>

      {leaderMode && fullyAppliedApplications.length > 0 && (
        <div className="change-completion-notice" role="status">
          <span className="change-completion-icon"><CheckCircle2 size={20} aria-hidden="true" /></span>
          <span>
            <strong>{fullyAppliedApplications.length}건의 변경이 모든 제품에서 적용 완료되었습니다.</strong>
            <small>담당자 전원이 ‘적용 완료’로 처리한 변경만 집계합니다.</small>
          </span>
          <button className="ghost compact" onClick={showFullyAppliedApplications} type="button">완료 변경 보기</button>
        </div>
      )}

      <Section title="업무 목록" icon={<Filter size={18} />} aside={`${taskContexts.length}건`}>
        <div className="change-list-toolbar">
          <div className="segmented change-view-tabs" role="group" aria-label="보기 방식">
            <button aria-pressed={viewMode === 'change'} className={viewMode === 'change' ? 'selected' : ''} onClick={() => { setViewMode('change'); if (!leaderMode) setStatusFilter('all') }} type="button">변경건별</button>
            <button aria-pressed={viewMode === 'product'} className={viewMode === 'product' ? 'selected' : ''} onClick={() => setViewMode('product')} type="button">제품별</button>
            {leaderMode && <button aria-pressed={viewMode === 'assignee'} className={viewMode === 'assignee' ? 'selected' : ''} onClick={() => setViewMode('assignee')} type="button">담당자별</button>}
          </div>
          <label className="change-search"><Search size={15} /><input aria-label="변경 적용 검색" placeholder="변경번호, 제목, 제품, 담당자 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <select
            aria-label="업무 상태"
            value={statusFilter}
            onChange={(event) => {
              const next = event.target.value as ChangeTaskStatusFilter
              setStatusFilter(next)
              if (next !== 'pending') setAttentionFilter('all')
            }}
          >
            <option value="all">업무 상태 전체</option>
            <option value="pending">미적용</option>
            <option value="completed">적용 완료</option>
            <option value="not_applicable">해당 없음</option>
            <option value="cancelled">취소</option>
          </select>
          <select aria-label="목록 적용 구분" value={actionKindFilter} onChange={(event) => setActionKindFilter(event.target.value as ChangeActionKindFilter)}>
            <option value="all">적용 구분 전체</option>
            <option value="product_standard">제품표준서</option>
            <option value="other">기타</option>
          </select>
          <select
            aria-label="주의 조건"
            value={attentionFilter}
            onChange={(event) => {
              const next = event.target.value as ChangeAttentionFilter
              setAttentionFilter(next)
              if (next !== 'all') {
                setStatusFilter('pending')
                setApplicationFilter('published')
              }
            }}
          >
            <option value="all">주의 조건 전체</option>
            <option value="overdue">기한 초과</option>
            <option value="due_soon">D-3 이내</option>
            {leaderMode && <option value="unassigned">담당 미지정</option>}
          </select>
          <select aria-label="변경건 상태" value={applicationFilter} onChange={(event) => setApplicationFilter(event.target.value as ChangeApplicationStatusFilter)}>
            <option value="all">변경건 전체</option>
            <option value="published">배포</option>
            <option value="draft">초안</option>
            <option value="cancelled">취소</option>
          </select>
          <select aria-label="보관 상태" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as ChangeApplicationArchiveFilter)}>
            <option value="active">활성 변경건</option>
            <option value="archived">보관된 변경건</option>
            <option value="all">보관 상태 전체</option>
          </select>
        </div>

        {viewMode === 'change' ? (
          <div className="change-overview-layout">
            <div className="change-application-list" aria-label="변경건 목록">
              {applications.map((application) => {
                const contexts = selectApplicationTaskContexts(panelData, application.id)
                const progress = calculateChangeProgress(contexts)
                const selected = selectedApplication?.id === application.id
                const fullyApplied = completionByApplicationId.get(application.id)?.fullyApplied ?? false
                const canShowProgress = leaderMode || application.created_by === profile.id || contexts.length > 0
                const needsFullHistory = remoteHistoryIsCapped
                  && (leaderMode || application.created_by === profile.id)
                  && !isHistoryLoaded(application.id)
                return (
                  <button aria-pressed={selected} className={selected ? 'change-application-card selected' : 'change-application-card'} key={application.id} onClick={() => setSelectedApplicationId(application.id)} type="button">
                    <span className="change-application-card-top"><span><Badge status={application.status}>{applicationStatusLabel(application.status)}</Badge>{fullyApplied ? <Badge status="completed">변경 적용 완료</Badge> : application.archived_at && <Badge>보관</Badge>}</span><span>{application.change_number}</span></span>
                    <strong>{application.title}</strong>
                    <small>{applicationCreatorName(data, application)} · 시행 {formatDate(application.effective_date)}</small>
                    {canShowProgress && needsFullHistory ? (
                      <>
                        <span className="change-progress-copy">전체 이력 불러오기</span>
                        <span className="change-progress"><i style={{ width: '0%' }} /></span>
                        <span className="change-card-counts">전체 이력을 불러온 후 정확한 진행률을 표시합니다.</span>
                      </>
                    ) : canShowProgress ? (
                      <>
                        <span className="change-progress-copy">처리 {progress.processed} / {progress.total}제품 · {progress.percent}%</span>
                        <span className="change-progress"><i style={{ width: `${progress.percent}%` }} /></span>
                        <span className="change-card-counts">미적용 {progress.pending} · 초과 {progress.overdue} · 미지정 {progress.unassigned}</span>
                      </>
                    ) : <span className="change-card-counts">내 배정 업무 없음 · 공통정보 조회 가능</span>}
                  </button>
                )
              })}
              {applications.length === 0 && <EmptyState icon={<ClipboardList size={22} />} title="조건에 맞는 변경건이 없습니다." description="필터를 바꾸거나 새 적용업무를 등록해 보세요." />}
            </div>

            <div className="change-application-detail">
              {selectedApplication ? (
                <>
                  {completionByApplicationId.get(selectedApplication.id)?.fullyApplied && (
                    <div className="change-completion-banner" role="status">
                      <CheckCircle2 size={22} aria-hidden="true" />
                      <span><strong>모든 제품 적용 완료</strong><small>모든 제품 담당자의 적용 완료 처리가 끝났습니다.</small></span>
                    </div>
                  )}
                  <header className="change-detail-header">
                    <div><span>{selectedApplication.change_number}</span><h2>{selectedApplication.title}</h2><p>{selectedApplication.summary}</p></div>
                    <div className="change-detail-actions">
                      <CopyLinkButton tab="change-applications" entityId={selectedApplication.id} />
                      <button
                        className="ghost compact"
                        disabled={historyLoadingId === selectedApplication.id || isHistoryLoaded(selectedApplication.id)}
                        onClick={() => void loadFullHistory()}
                        type="button"
                      >
                        <History size={14} />
                        {historyLoadingId === selectedApplication.id
                          ? '이력 불러오는 중'
                          : isHistoryLoaded(selectedApplication.id) ? '전체 이력 확인됨' : '전체 이력 불러오기'}
                      </button>
                      {canEditChangeApplication(selectedApplication, selectedContexts, profile) && <button className="ghost compact" onClick={() => setComposer({ editingId: selectedApplication.id })} type="button"><FilePenLine size={14} />{selectedApplication.status === 'draft' ? '초안 이어쓰기' : '수정'}</button>}
                      {leaderMode && !selectedApplication.archived_at && selectedContexts.length > 0 && selectedContexts.every(({ task }) => task.status !== 'pending') && <button className="ghost compact" onClick={() => setDialog({ kind: 'archive_application', application: selectedApplication })} type="button"><Archive size={14} />보관</button>}
                      {leaderMode && selectedApplication.archived_at && <button className="ghost compact" onClick={() => setDialog({ kind: 'restore_application', application: selectedApplication })} type="button"><ArchiveRestore size={14} />복원</button>}
                      {!selectedApplication.archived_at && selectedApplication.status !== 'cancelled' && (leaderMode || selectedApplication.created_by === profile.id) && <button className="ghost compact" onClick={() => setDialog({ kind: 'cancel_application', application: selectedApplication })} type="button"><XCircle size={14} />취소</button>}
                    </div>
                  </header>
                  <div className="change-detail-meta">
                    <span>등록자 <strong>{applicationCreatorName(data, selectedApplication)}</strong></span>
                    <span>시행일 <strong>{formatDate(selectedApplication.effective_date)}</strong></span>
                    <span>상태 <strong>{applicationStatusLabel(selectedApplication.status)}</strong></span>
                    {selectedApplication.archived_at && <span>보관일 <strong>{formatDate(selectedApplication.archived_at)}</strong></span>}
                    {selectedApplication.source_url && <a href={selectedApplication.source_url} rel="noreferrer" target="_blank">공식 문서 열기</a>}
                  </div>
                  {selectedApplication.archived_at && <p className="change-task-note">보관 사유: {selectedApplication.archive_reason}</p>}
                  {historyError && <p className="field-error" role="alert">{historyError}</p>}
                  {data.changeActionItems.filter((item) => item.change_application_id === selectedApplication.id).map((item) => <div className="change-action-summary" key={item.id}><Badge>{changeActionLabel(item)}</Badge><strong>{item.content}</strong><span>적용기한 {formatDate(item.due_date)}</span></div>)}
                  {(leaderMode || selectedApplication.created_by === profile.id || selectedContexts.length > 0) ? (
                    <>
                      <div className="change-detail-progress">
                        {remoteHistoryIsCapped
                          && (leaderMode || selectedApplication.created_by === profile.id)
                          && !isHistoryLoaded(selectedApplication.id) ? (
                          <>
                            <div><strong>—</strong><span>전체 이력 불러오기</span></div>
                            <span className="change-progress"><i style={{ width: '0%' }} /></span>
                            <p>전체 이력을 불러온 후 정확한 진행률을 표시합니다.</p>
                          </>
                        ) : (() => {
                          const progress = calculateChangeProgress(selectedContexts)
                          return <><div><strong>{progress.percent}%</strong><span>처리 {progress.processed} / {progress.total}제품</span></div><span className="change-progress"><i style={{ width: `${progress.percent}%` }} /></span><p>완료 {progress.completed} · 해당 없음 {progress.notApplicable} · 미적용 {progress.pending} · 기한 초과 {progress.overdue} · 담당 미지정 {progress.unassigned}</p></>
                        })()}
                      </div>
                      <div className="change-task-table-head"><span>제품 / 적용 항목</span><span>변경건</span><span>기한</span><span>상태</span><span>처리</span></div>
                      <div className="change-task-list">{selectedContexts.map(taskRow)}{selectedContexts.length === 0 && <EmptyState icon={<Package size={22} />} title="표시할 제품 적용업무가 없습니다." />}</div>
                    </>
                  ) : (
                    <EmptyState
                      icon={<Package size={22} />}
                      title="내게 배정된 제품 적용업무가 없습니다."
                      description="변경 공통정보는 조회할 수 있으며 전체 제품 진행현황은 파트장이 관리합니다."
                    />
                  )}
                </>
              ) : <EmptyState icon={<ClipboardList size={22} />} title="변경건을 선택해 주세요." />}
            </div>
          </div>
        ) : (
          <div className="change-group-list">
            {groupedContexts.map((group) => (
              <article className="change-group" key={`${viewMode}-${group.title}`}>
                <header><div>{viewMode === 'product' ? <Package size={17} /> : <Users size={17} />}<span><strong>{group.title}</strong><small>{group.sub}</small></span></div><Badge>{group.items.length}건</Badge></header>
                <div className="change-task-table-head"><span>제품 / 적용 항목</span><span>변경건</span><span>기한</span><span>상태</span><span>처리</span></div>
                <div className="change-task-list">{group.items.map(taskRow)}</div>
              </article>
            ))}
            {groupedContexts.length === 0 && <EmptyState icon={<Package size={22} />} title="조건에 맞는 적용업무가 없습니다." description="상태나 검색 필터를 바꿔 보세요." />}
          </div>
        )}
      </Section>

      {composer && (
        <ChangeApplicationComposer
          data={data}
          profile={profile}
          editingApplicationId={composer.editingId}
          onClose={() => setComposer(null)}
          onSave={saveComposer}
          onOpenExisting={(applicationId) => {
            setComposer(null)
            openApplication(applicationId)
          }}
        />
      )}
      {dialog && <ChangeActionModal dialog={dialog} data={data} profile={profile} onClose={() => setDialog(null)} onConfirm={runDialog} />}
    </div>
  )
}
