import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
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
import { Badge, EmptyState, Section } from '../components/ui'
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
  calculateChangeApplicationKpis,
  changeApplicationWorkflowLabel,
  filterApplicationsByLeaderTab,
  groupChangeTaskContexts,
  type ChangeApplicationViewMode,
  type ChangeTaskStatusFilter,
  type LeaderChangeApplicationTab,
  type MemberChangeApplicationTab,
} from '../features/change-applications/viewModel'
import { useChangeApplicationController } from '../features/change-applications/useChangeApplicationController'
import { daysUntil, dueDateLabel } from '../lib/dates'
import { formatDate } from '../lib/format'
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
    ...contexts.flatMap(({ task }) => [task.product_name, task.assignee_name ?? '']),
  ].join('\n').toLocaleLowerCase('ko').includes(normalized)
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
  const [leaderTab, setLeaderTab] = useState<LeaderChangeApplicationTab>('active')
  const [memberTab, setMemberTab] = useState<MemberChangeApplicationTab>('pending')
  const [viewMode, setViewMode] = useState<ChangeApplicationViewMode>(leaderMode ? 'change' : 'product')
  const [statusFilter, setStatusFilter] = useState<ChangeTaskStatusFilter>(leaderMode ? 'all' : 'pending')
  const [query, setQuery] = useState('')
  const [selectedApplicationId, setSelectedApplicationId] = useState<string | null>(initialSelectedId ?? null)
  const [composer, setComposer] = useState<{ editingId: string | null } | null>(null)
  const [dialog, setDialog] = useState<ChangeActionDialog | null>(null)
  const [finalizationDialog, setFinalizationDialog] = useState<FinalizationDialog | null>(null)

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
  const baseContexts = leaderMode
    ? allContexts.filter(({ application }) => {
        const workflow = summaryByApplication.get(application.id)?.workflow_status
        return leaderTab === 'final_review'
          ? workflow === 'final_review_ready'
          : workflow === 'draft' || workflow === 'in_progress'
      })
    : ownPendingContexts
  const filteredContexts = baseContexts.filter((context) => {
    if (statusFilter !== 'all' && context.task.status !== statusFilter) return false
    return applicationMatchesQuery(context.application, [context], query)
  })

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
    if (statusFilter === 'all') return true
    return contexts.some(
      ({ task }) => task.status === statusFilter && (leaderMode || task.assignee_id === profile.id),
    )
  })

  const selectedApplication = applications.find((application) => application.id === selectedApplicationId)
    ?? applications[0]
    ?? null
  const selectedContexts = selectedApplication ? contextsByApplication.get(selectedApplication.id) ?? [] : []
  const selectedSummary = selectedApplication ? summaryByApplication.get(selectedApplication.id) ?? null : null
  const groupedContexts = viewMode === 'change' ? [] : groupChangeTaskContexts(filteredContexts, viewMode)
  const { overdueCount, dueSoonCount, unassignedCount } = calculateChangeApplicationKpis(allContexts, leaderMode, profile.id)

  useEffect(() => {
    if (!initialSelectedId) return
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
    }
    setSelectedApplicationId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, leaderMode, onInitialSelectionApplied, summaryByApplication])

  const showLeaderTab = (tab: LeaderChangeApplicationTab) => {
    setLeaderTab(tab)
    setSelectedApplicationId(null)
    setQuery('')
    setStatusFilter('all')
    setViewMode('change')
  }

  const saveComposer = (input: ChangeApplicationInput, publish: boolean) => mutate(async () => {
    const id = await controller.save(input, publish)
    setLeaderTab('active')
    setSelectedApplicationId(id)
  }, publish ? '공통변경을 배포했습니다.' : '공통변경 초안을 저장했습니다.')

  const runDialog = (result: ChangeActionDialogResult) => {
    if (!dialog) return Promise.resolve(false)
    if (dialog.kind === 'complete') return mutate(async () => {
      await controller.completeTask(dialog.task.id, result.note, '')
      setMemberTab('history')
      setStatusFilter('all')
    }, `${dialog.task.product_name} 적용을 완료했습니다.`)
    if (dialog.kind === 'not_applicable') return mutate(async () => {
      await controller.markNotApplicable(dialog.task.id, result.reason, '')
      setMemberTab('history')
      setStatusFilter('all')
    }, `${dialog.task.product_name}을 해당 없음으로 처리했습니다.`)
    if (dialog.kind === 'reopen') return mutate(async () => {
      await controller.reopenTask(dialog.task.id, result.reason)
      setMemberTab('pending')
      setStatusFilter('pending')
    }, `${dialog.task.product_name} 적용업무를 다시 열었습니다.`)
    if (dialog.kind === 'reassign') {
      if (!result.assigneeId) return Promise.resolve(false)
      return mutate(
        () => controller.reassignTasks([dialog.task.id], result.assigneeId!, result.reason),
        `${dialog.task.product_name} 책임자를 변경했습니다.`,
      )
    }
    if (dialog.kind === 'remove_scope') return mutate(
      () => controller.removeScope(dialog.task.id, result.reason),
      `${dialog.task.product_name}을 적용범위에서 제외했습니다.`,
    )
    if (dialog.kind === 'restore_scope') return mutate(
      () => controller.restoreScope(dialog.task.id, result.reason),
      `${dialog.task.product_name}을 적용범위에 복원했습니다.`,
    )
    if (dialog.kind === 'cancel_application') return mutate(
      () => controller.cancelApplication(dialog.application.id, result.reason),
      `${dialog.application.change_number} 변경건을 취소했습니다.`,
    )
    return Promise.resolve(false)
  }

  const finalize = (application: ChangeApplication, note: string) => mutate(async () => {
    await controller.finalizeApplication(application.id, application.updated_at, note)
    setLeaderTab('history')
    setSelectedApplicationId(null)
  }, `${application.change_number} 공통변경을 완료했습니다.`)

  const undoFinalization = (
    application: ChangeApplication,
    reason: string,
    reopenTasks: ReopenChangeTask[],
  ) => mutate(async () => {
    await controller.undoFinalization(application.id, application.updated_at, reason, reopenTasks)
    setLeaderTab('active')
    setSelectedApplicationId(application.id)
  }, `${application.change_number} 완료를 취소하고 선택한 제품 업무를 재개했습니다.`)

  const openHistoryUndo = (row: ChangeApplicationHistoryRow) => {
    setFinalizationDialog({
      mode: 'undo',
      application: row,
      summary: row.application_summary,
      tasks: row.product_tasks,
    })
  }

  const taskRow = ({ task, actionItem, application }: ProductChangeTaskContext) => {
    const workflow = summaryByApplication.get(application.id)?.workflow_status
    const canProcess = !leaderMode
      && workflow === 'in_progress'
      && task.status === 'pending'
      && task.assignee_id === profile.id
    const canManage = leaderMode && workflow === 'in_progress'
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
    const canReassign = canManage && (task.status === 'pending' || needsRecoveryReassignment)
    const overdue = task.status === 'pending' && (daysUntil(actionItem.due_date) ?? 0) < 0
    return (
      <article className="change-task-row" data-status={task.status} key={task.id}>
        <div className="change-task-product"><strong>{task.product_name}</strong><span>{changeActionLabel(actionItem)} · {task.assignee_name ?? '담당 미지정'}{needsRecoveryReassignment ? ' (비활성)' : ''}</span></div>
        <div className="change-task-source"><strong>{application.change_number}</strong><span>{application.title}</span></div>
        <div className={overdue ? 'change-task-due overdue' : 'change-task-due'}><strong>{dueDateLabel(actionItem.due_date)}</strong><span>{formatDate(actionItem.due_date)}</span></div>
        <div className="change-task-status"><Badge status={task.status}>{task.status === 'cancelled' && task.cancel_kind === 'scope_removed' ? '범위 제외' : productChangeTaskStatusLabels[task.status]}</Badge>{task.completed_at && <small>{formatDate(task.completed_at)}</small>}</div>
        <div className="change-task-actions">
          {canProcess && <><button className="ghost compact" onClick={() => setDialog({ kind: 'not_applicable', task })} type="button">해당 없음</button><button className="primary compact" onClick={() => setDialog({ kind: 'complete', task })} type="button">적용 완료</button></>}
          {canReassign && <button aria-label={`${task.product_name} ${needsRecoveryReassignment ? '활성 책임자 재배정' : '담당자 변경'}`} className="icon-button" onClick={() => setDialog({ kind: 'reassign', task })} title={needsRecoveryReassignment ? '활성 책임자 재배정' : '담당자 변경'} type="button"><UserRoundCog size={15} /></button>}
          {canManage && task.status === 'pending' && <button aria-label={`${task.product_name} 범위 제외`} className="icon-button" onClick={() => setDialog({ kind: 'remove_scope', task })} title="범위 제외" type="button"><XCircle size={15} /></button>}
          {canReopen && <button className="ghost compact" onClick={() => setDialog({ kind: 'reopen', task })} type="button"><RotateCcw size={14} />다시 열기</button>}
          {leaderMode && task.status === 'cancelled' && task.cancel_kind === 'scope_removed' && !application.content_locked_at && <button className="ghost compact" onClick={() => setDialog({ kind: 'restore_scope', task })} type="button">범위 복원</button>}
        </div>
        {(task.completion_note || task.resolution_reason || task.reopen_reason) && <p className="change-task-note">{task.completion_note || task.resolution_reason || `재개: ${task.reopen_reason}`}</p>}
      </article>
    )
  }

  const renderDetail = () => {
    if (!selectedApplication || !selectedSummary) return <EmptyState icon={<ClipboardList size={22} />} title="변경건을 선택해 주세요." />
    return (
      <>
        {selectedSummary.workflow_status === 'final_review_ready' && <div className="change-completion-banner" role="status"><CheckCircle2 size={22} /><span><strong>파트장 최종 확인 대기</strong><small>모든 제품 처리가 끝났습니다. 예외 사유를 확인하고 변경을 완료하세요.</small></span></div>}
        <header className="change-detail-header">
          <div><span>{selectedApplication.change_number}</span><h2>{selectedApplication.title}</h2><p>{selectedApplication.summary}</p></div>
          <div className="change-detail-actions">
            <CopyLinkButton tab="change-applications" entityId={selectedApplication.id} />
            {leaderMode && canEditChangeApplication(selectedApplication, selectedContexts, profile) && <button className="ghost compact" onClick={() => setComposer({ editingId: selectedApplication.id })} type="button"><FilePenLine size={14} />{selectedApplication.status === 'draft' ? '초안 이어쓰기' : '수정'}</button>}
            {leaderMode && selectedSummary.workflow_status === 'final_review_ready' && <button className="primary compact" onClick={() => setFinalizationDialog({ mode: 'finalize', application: selectedApplication, summary: selectedSummary, tasks: selectedContexts.map(({ task }) => task) })} type="button"><CheckCircle2 size={14} />변경 완료</button>}
            {leaderMode && selectedApplication.status !== 'cancelled' && <button className="ghost compact" onClick={() => setDialog({ kind: 'cancel_application', application: selectedApplication })} type="button"><XCircle size={14} />변경 취소</button>}
          </div>
        </header>
        <div className="change-detail-meta"><span>등록자 <strong>{applicationCreatorName(data, selectedApplication)}</strong></span><span>시행일 <strong>{formatDate(selectedApplication.effective_date)}</strong></span><span>상태 <strong>{changeApplicationWorkflowLabel(selectedSummary.workflow_status)}</strong></span>{selectedApplication.source_url && <a href={selectedApplication.source_url} rel="noreferrer" target="_blank">공식 문서 열기</a>}</div>
        {data.changeActionItems.filter((item) => item.change_application_id === selectedApplication.id).map((item) => <div className="change-action-summary" key={item.id}><Badge>{changeActionLabel(item)}</Badge><strong>{item.content}</strong><span>적용기한 {formatDate(item.due_date)}</span></div>)}
        <div className="change-detail-progress"><div><strong>{selectedSummary.percent}%</strong><span>처리 {selectedSummary.processed_count} / {selectedSummary.total_count}제품</span></div><span className="change-progress"><i style={{ width: `${selectedSummary.percent}%` }} /></span><p>완료 {selectedSummary.completed_count} · 해당 없음 {selectedSummary.not_applicable_count} · 범위 제외 {selectedSummary.scope_removed_count} · 미적용 {selectedSummary.pending_count}</p></div>
        <div className="change-task-table-head"><span>제품 / 적용 항목</span><span>변경건</span><span>기한</span><span>상태</span><span>처리</span></div>
        <div className="change-task-list">{selectedContexts.map(taskRow)}{selectedContexts.length === 0 && <EmptyState icon={<Package size={22} />} title="표시할 제품 적용업무가 없습니다." />}</div>
      </>
    )
  }

  return (
    <div className="stack change-applications-page">
      <div className="page-intro change-page-intro">
        <div><h1>변경 적용</h1><p>{leaderMode ? '제품별 처리를 확인하고 공통변경을 최종 완료합니다.' : '내 제품의 미적용 공통변경을 처리하고 이력을 확인합니다.'}</p></div>
        {leaderMode && <button className="primary" onClick={() => setComposer({ editingId: null })} type="button"><Plus size={16} />공통변경 등록</button>}
      </div>

      {leaderMode ? (
        <div className="segmented change-primary-tabs" role="tablist" aria-label="공통변경 업무 구분">
          <button aria-selected={leaderTab === 'active'} className={leaderTab === 'active' ? 'selected' : ''} onClick={() => showLeaderTab('active')} role="tab" type="button">진행 중</button>
          <button aria-selected={leaderTab === 'final_review'} className={leaderTab === 'final_review' ? 'selected' : ''} onClick={() => showLeaderTab('final_review')} role="tab" type="button">최종 확인 대기 <Badge>{finalReviewCount}</Badge></button>
          <button aria-selected={leaderTab === 'history'} className={leaderTab === 'history' ? 'selected' : ''} onClick={() => showLeaderTab('history')} role="tab" type="button">완료 이력</button>
        </div>
      ) : (
        <div className="segmented change-primary-tabs member" role="tablist" aria-label="내 공통변경 업무 구분">
          <button aria-selected={memberTab === 'pending'} className={memberTab === 'pending' ? 'selected' : ''} onClick={() => { setMemberTab('pending'); setStatusFilter('pending') }} role="tab" type="button">내 미적용 <Badge>{ownPendingContexts.length}</Badge></button>
          <button aria-selected={memberTab === 'history'} className={memberTab === 'history' ? 'selected' : ''} onClick={() => setMemberTab('history')} role="tab" type="button">처리 이력</button>
        </div>
      )}

      <div className="kpi-strip change-kpis">
        <button className="kpi-stat" onClick={() => { if (leaderMode) showLeaderTab('active'); else setMemberTab('pending') }} type="button"><span className="kpi-stat-label">{leaderMode ? '전체 미적용' : '내 미적용'}<ClipboardList size={15} /></span><strong className="kpi-stat-value">{leaderMode ? allContexts.filter(({ task, application }) => task.status === 'pending' && application.status === 'published' && !application.final_completed_at).length : ownPendingContexts.length}<span className="unit">건</span></strong></button>
        <button className="kpi-stat" data-tone={overdueCount > 0 ? 'warning' : undefined} type="button"><span className="kpi-stat-label">기한 초과<AlertTriangle size={15} /></span><strong className="kpi-stat-value">{overdueCount}<span className="unit">건</span></strong></button>
        <button className="kpi-stat" data-tone={dueSoonCount > 0 ? 'warning' : undefined} type="button"><span className="kpi-stat-label">D-3 이내<CalendarClock size={15} /></span><strong className="kpi-stat-value">{dueSoonCount}<span className="unit">건</span></strong></button>
        {leaderMode && <button className="kpi-stat" data-tone={finalReviewCount > 0 ? 'success' : undefined} onClick={() => showLeaderTab('final_review')} type="button"><span className="kpi-stat-label">최종 확인 대기<CheckCircle2 size={15} /></span><strong className="kpi-stat-value">{finalReviewCount}<span className="unit">건</span></strong></button>}
        {leaderMode && <button className="kpi-stat" data-tone={unassignedCount > 0 ? 'warning' : undefined} type="button"><span className="kpi-stat-label">담당 미지정<UserRoundCog size={15} /></span><strong className="kpi-stat-value">{unassignedCount}<span className="unit">건</span></strong></button>}
      </div>

      {(leaderMode && leaderTab === 'history') || (!leaderMode && memberTab === 'history') ? (
        <>
          {!leaderMode && ownProcessedContexts.length > 0 && (
            <>
              <div className="change-completion-banner" role="status">
                <CheckCircle2 size={22} />
                <span>
                  <strong>{ownProcessingReachedFinalReview ? '파트장 최종 확인 대기' : '내 제품 처리 완료'}</strong>
                  <small>{ownProcessingReachedFinalReview
                    ? '모든 제품 처리가 끝났습니다. 파트장이 결과를 확인하면 공통변경이 최종 완료됩니다.'
                    : '내 처리 결과를 보관했습니다. 다른 제품 처리와 파트장 최종 확인을 기다립니다.'}</small>
                </span>
              </div>
              <Section title="최종 확인 전 처리" icon={<RotateCcw size={18} />} aside={`${ownProcessedContexts.length}건`}>
                <div className="change-task-table-head"><span>제품 / 적용 항목</span><span>변경건</span><span>기한</span><span>상태</span><span>처리</span></div>
                <div className="change-task-list">{ownProcessedContexts.map(taskRow)}</div>
              </Section>
            </>
          )}
          <Section title={leaderMode ? '완료 이력' : '최종 완료 이력'} icon={<History size={18} />}>
            <ChangeApplicationHistory
              data={data}
              profile={profile}
              fetchPage={controller.fetchHistoryPage}
              onUndoCompletion={leaderMode ? openHistoryUndo : undefined}
              initialSelectedId={initialSelectedId}
              onInitialSelectionApplied={onInitialSelectionApplied}
            />
          </Section>
        </>
      ) : (
        <Section title={leaderMode ? (leaderTab === 'final_review' ? '최종 확인 대기' : '공통변경 목록') : '내 미적용 업무'} icon={<Filter size={18} />} aside={`${viewMode === 'change' ? applications.length : filteredContexts.length}건`}>
          <div className="change-list-toolbar compact-controls">
            <div className="segmented change-view-tabs" role="group" aria-label="보기 방식"><button aria-pressed={viewMode === 'change'} className={viewMode === 'change' ? 'selected' : ''} onClick={() => setViewMode('change')} type="button">변경건별</button><button aria-pressed={viewMode === 'product'} className={viewMode === 'product' ? 'selected' : ''} onClick={() => setViewMode('product')} type="button">제품별</button>{leaderMode && <button aria-pressed={viewMode === 'assignee'} className={viewMode === 'assignee' ? 'selected' : ''} onClick={() => setViewMode('assignee')} type="button">담당자별</button>}</div>
            <label className="change-search"><Search size={15} /><input aria-label="변경 적용 검색" placeholder="변경번호, 제목, 제품, 담당자 검색" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            {leaderMode && <select aria-label="업무 상태" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ChangeTaskStatusFilter)}><option value="all">업무 상태 전체</option><option value="pending">미적용</option><option value="completed">적용 완료</option><option value="not_applicable">해당 없음</option><option value="cancelled">취소</option></select>}
          </div>

          {viewMode === 'change' ? (
            <div className="change-overview-layout">
              <div className="change-application-list" aria-label="변경건 목록">
                {applications.map((application) => {
                  const summary = summaryByApplication.get(application.id)
                  if (!summary) return null
                  const selected = selectedApplication?.id === application.id
                  return <button aria-pressed={selected} className={selected ? 'change-application-card selected' : 'change-application-card'} key={application.id} onClick={() => setSelectedApplicationId(application.id)} type="button"><span className="change-application-card-top"><Badge status={summary.workflow_status}>{changeApplicationWorkflowLabel(summary.workflow_status)}</Badge><span>{application.change_number}</span></span><strong>{application.title}</strong><small>{applicationCreatorName(data, application)} · 시행 {formatDate(application.effective_date)}</small><span className="change-progress-copy">처리 {summary.processed_count} / {summary.total_count}제품 · {summary.percent}%</span><span className="change-progress"><i style={{ width: `${summary.percent}%` }} /></span><span className="change-card-counts">미적용 {summary.pending_count} · 해당 없음 {summary.not_applicable_count} · 범위 제외 {summary.scope_removed_count}</span></button>
                })}
                {applications.length === 0 && <EmptyState icon={<ClipboardList size={22} />} title={leaderMode && leaderTab === 'final_review' ? '최종 확인을 기다리는 변경이 없습니다.' : '조건에 맞는 공통변경이 없습니다.'} />}
              </div>
              <div className="change-application-detail">{renderDetail()}</div>
            </div>
          ) : (
            <div className="change-group-list">
              {groupedContexts.map((group) => <article className="change-group" key={`${viewMode}-${group.title}`}><header><div>{viewMode === 'product' ? <Package size={17} /> : <Users size={17} />}<span><strong>{group.title}</strong><small>{group.sub}</small></span></div><Badge>{group.items.length}건</Badge></header><div className="change-task-table-head"><span>제품 / 적용 항목</span><span>변경건</span><span>기한</span><span>상태</span><span>처리</span></div><div className="change-task-list">{group.items.map(taskRow)}</div></article>)}
              {groupedContexts.length === 0 && <EmptyState icon={<Package size={22} />} title="조건에 맞는 적용업무가 없습니다." />}
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
