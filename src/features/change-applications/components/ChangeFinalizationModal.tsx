import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import { Badge, Modal } from '../../../components/ui'
import type { ChangeApplication, ChangeApplicationSummary, ChangeAssigneeOption, ProductChangeTask } from '../../../types'

export type ReopenChangeTask = {
  taskId: string
  assigneeId: string
}

function exceptionReason(task: ProductChangeTask) {
  return task.resolution_reason || task.completion_note || '사유가 기록되지 않았습니다.'
}

export function ChangeFinalizationModal({
  mode,
  application,
  summary,
  tasks,
  assignees,
  onClose,
  onFinalize,
  onUndo,
}: {
  mode: 'finalize' | 'undo'
  application: ChangeApplication
  summary: ChangeApplicationSummary
  tasks: ProductChangeTask[]
  assignees: ChangeAssigneeOption[]
  onClose: () => void
  onFinalize: (note: string) => Promise<boolean>
  onUndo: (reason: string, reopenTasks: ReopenChangeTask[]) => Promise<boolean>
}) {
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const firstFieldRef = useRef<HTMLTextAreaElement>(null)
  const exceptions = useMemo(
    () => tasks.filter((task) => task.status === 'not_applicable' || task.cancel_kind === 'scope_removed'),
    [tasks],
  )
  const reopenableTasks = useMemo(
    () => tasks.filter((task) => task.status === 'completed'
      || task.status === 'not_applicable'
      || (task.status === 'cancelled' && task.cancel_kind === 'scope_removed')),
    [tasks],
  )
  const hasExceptions = summary.not_applicable_count + summary.scope_removed_count > 0
  const selectedTaskIds = Object.keys(selected)
  const canFinalize = summary.can_finalize && (!hasExceptions || Boolean(note.trim()))
  const canUndo = Boolean(reason.trim())
    && selectedTaskIds.length > 0
    && selectedTaskIds.every((taskId) => Boolean(selected[taskId]))

  const toggleTask = (task: ProductChangeTask) => {
    setSelected((current) => {
      const next = { ...current }
      if (task.id in next) delete next[task.id]
      else next[task.id] = task.assignee_id ?? ''
      return next
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={mode === 'finalize' ? '파트장 최종 확인' : '완료 취소'}
      title={mode === 'finalize' ? '공통변경을 최종 완료할까요?' : '완료를 취소하고 업무를 다시 열까요?'}
      icon={mode === 'finalize' ? <CheckCircle2 size={18} /> : <RotateCcw size={18} />}
      className="change-finalization-modal"
      initialFocusRef={firstFieldRef}
    >
      <form
        className="change-finalization-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (mode === 'finalize' && canFinalize) {
            void onFinalize(note.trim()).then((ok) => ok && onClose())
          } else if (mode === 'undo' && canUndo) {
            void onUndo(reason.trim(), selectedTaskIds.map((taskId) => ({
              taskId,
              assigneeId: selected[taskId],
            }))).then((ok) => ok && onClose())
          }
        }}
      >
        <div className="change-action-subject"><strong>{application.change_number}</strong><span>{application.title}</span></div>
        <div className="change-finalization-counts" aria-label="제품 처리 결과">
          <div><span>전체</span><strong>{summary.total_count}</strong></div>
          <div><span>적용 완료</span><strong>{summary.completed_count}</strong></div>
          <div><span>해당 없음</span><strong>{summary.not_applicable_count}</strong></div>
          <div><span>범위 제외</span><strong>{summary.scope_removed_count}</strong></div>
          <div data-warning={summary.pending_count > 0}><span>미적용</span><strong>{summary.pending_count}</strong></div>
          <div data-warning={summary.unresolved_cancelled_count > 0}><span>미해결 취소</span><strong>{summary.unresolved_cancelled_count}</strong></div>
        </div>

        {mode === 'finalize' ? (
          <>
            {exceptions.length > 0 && (
              <section className="change-exception-review" aria-labelledby="change-exception-title">
                <header><AlertTriangle size={16} /><strong id="change-exception-title">예외 사유 확인</strong><Badge>{exceptions.length}건</Badge></header>
                <div>{exceptions.map((task) => <article key={task.id}><span><strong>{task.product_name}</strong><Badge status={task.status}>{task.status === 'not_applicable' ? '해당 없음' : '범위 제외'}</Badge></span><p>{exceptionReason(task)}</p></article>)}</div>
              </section>
            )}
            {!summary.can_finalize && <p className="field-error" role="alert">미적용, 담당 미지정, 미해결 취소 건을 먼저 처리하세요.</p>}
            <label>
              최종 확인 메모 {hasExceptions ? <span className="required">*</span> : <small>선택</small>}
              <textarea ref={firstFieldRef} aria-label="최종 확인 메모" maxLength={2000} placeholder="확인 내용을 기록하세요." value={note} onChange={(event) => setNote(event.target.value)} />
            </label>
          </>
        ) : (
          <>
            <label>
              완료 취소 사유 <span className="required">*</span>
              <textarea ref={firstFieldRef} aria-label="완료 취소 사유" maxLength={2000} placeholder="다시 적용해야 하는 이유를 입력하세요." value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            <fieldset className="change-reopen-fieldset">
              <legend>재개할 제품과 책임자 <span className="required">*</span></legend>
              <div className="change-reopen-list">
                {reopenableTasks.map((task) => {
                  const checked = task.id in selected
                  return (
                    <div className={checked ? 'change-reopen-row selected' : 'change-reopen-row'} key={task.id}>
                      <label><input checked={checked} onChange={() => toggleTask(task)} type="checkbox" /><span><strong>{task.product_name}</strong><small>기존 책임자 {task.assignee_name ?? '미지정'}</small></span></label>
                      {checked && <select aria-label={`${task.product_name} 재개 책임자`} value={selected[task.id]} onChange={(event) => setSelected((current) => ({ ...current, [task.id]: event.target.value }))}><option value="">책임자 선택</option>{assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}{assignee.role === 'leader' ? ' (파트장)' : ''}</option>)}</select>}
                    </div>
                  )
                })}
              </div>
            </fieldset>
          </>
        )}

        <footer className="modal-footer">
          <button className="ghost" onClick={onClose} type="button">닫기</button>
          <button className={mode === 'undo' ? 'danger' : 'primary'} disabled={mode === 'finalize' ? !canFinalize : !canUndo} type="submit">{mode === 'finalize' ? '변경 완료' : '완료 취소 및 업무 재개'}</button>
        </footer>
      </form>
    </Modal>
  )
}
