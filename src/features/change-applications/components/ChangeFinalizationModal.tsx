import { useId, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, RotateCcw } from 'lucide-react'
import { Badge, DialogActions, Modal } from '../../../components/ui'
import type { ChangeApplication, ChangeApplicationSummary, ChangeAssigneeOption, ProductChangeTask } from '../../../types'

export type ReopenChangeTask = {
  taskId: string
  assigneeId: string
}

function exceptionReason(task: ProductChangeTask) {
  return task.resolution_reason || task.completion_note || '남긴 사유가 없어요.'
}

type FinalizationErrors = {
  note?: string
  reason?: string
  tasks?: string
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
  const noteId = useId()
  const noteErrorId = useId()
  const reasonId = useId()
  const reasonErrorId = useId()
  const tasksErrorId = useId()
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [selected, setSelected] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<FinalizationErrors>({})
  const [submitting, setSubmitting] = useState(false)
  const firstFieldRef = useRef<HTMLTextAreaElement>(null)
  const reopenListRef = useRef<HTMLDivElement>(null)
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
  const dirty = Boolean(note.trim() || reason.trim()) || selectedTaskIds.length > 0

  const toggleTask = (task: ProductChangeTask) => {
    setSelected((current) => {
      const next = { ...current }
      if (task.id in next) delete next[task.id]
      else next[task.id] = task.assignee_id ?? ''
      return next
    })
    if (errors.tasks) setErrors((current) => ({ ...current, tasks: undefined }))
  }

  const finish = (operation: Promise<boolean>) => {
    setSubmitting(true)
    void operation.then((ok) => {
      setSubmitting(false)
      if (ok) onClose()
    })
  }

  const submit = () => {
    if (mode === 'finalize') {
      if (!summary.can_finalize) return
      if (hasExceptions && !note.trim()) {
        setErrors({ note: '해당 없음이나 범위 제외가 있으면 확인한 내용을 적어 주세요.' })
        firstFieldRef.current?.focus()
        return
      }
      setErrors({})
      finish(onFinalize(note.trim()))
      return
    }
    const nextErrors: FinalizationErrors = {}
    if (!reason.trim()) nextErrors.reason = '완료를 취소하는 이유를 적어 주세요.'
    if (selectedTaskIds.length === 0) nextErrors.tasks = '다시 열 제품을 한 개 이상 골라 주세요.'
    else if (!selectedTaskIds.every((taskId) => Boolean(selected[taskId]))) nextErrors.tasks = '다시 열 제품마다 담당자를 골라 주세요.'
    setErrors(nextErrors)
    if (nextErrors.reason) {
      firstFieldRef.current?.focus()
      return
    }
    if (nextErrors.tasks) {
      reopenListRef.current?.querySelector<HTMLElement>('input, select')?.focus()
      return
    }
    finish(onUndo(reason.trim(), selectedTaskIds.map((taskId) => ({
      taskId,
      assigneeId: selected[taskId],
    }))))
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={mode === 'finalize' ? '파트장 최종 확인' : '완료 취소'}
      title={mode === 'finalize' ? '공통변경을 최종 완료할까요?' : '완료를 취소하고 업무를 다시 열까요?'}
      description={mode === 'finalize'
        ? '완료하면 완료 이력으로 옮겨요. 필요하면 나중에 완료를 취소할 수 있어요.'
        : '고른 적용 업무를 다시 열어 담당자의 미적용 목록에 보여 줘요.'}
      icon={mode === 'finalize' ? <CheckCircle2 size={18} /> : <RotateCcw size={18} />}
      className="change-finalization-modal"
      initialFocusRef={firstFieldRef}
      dirty={dirty && !submitting}
    >
      <form
        aria-busy={submitting || undefined}
        className="change-finalization-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!submitting) submit()
        }}
      >
        <div className="change-action-subject"><strong>{application.change_number}</strong><span>{application.title}</span></div>
        <div className="change-finalization-counts" aria-label="제품 처리 결과">
          <div><span>전체</span><strong>{summary.total_count}</strong></div>
          <div><span>적용 완료</span><strong>{summary.completed_count}</strong></div>
          <div><span>해당 없음</span><strong>{summary.not_applicable_count}</strong></div>
          <div><span>범위 제외</span><strong>{summary.scope_removed_count}</strong></div>
          <div data-warning={summary.pending_count > 0}><span>미적용</span><strong>{summary.pending_count}</strong></div>
          <div data-warning={summary.unresolved_cancelled_count > 0}><span>확인할 취소</span><strong>{summary.unresolved_cancelled_count}</strong></div>
        </div>

        {mode === 'finalize' ? (
          <>
            {exceptions.length > 0 && (
              <section className="change-exception-review" aria-labelledby="change-exception-title">
                <header><AlertTriangle size={16} /><strong id="change-exception-title">해당 없음·범위 제외 사유</strong><Badge>{exceptions.length}건</Badge></header>
                <div>{exceptions.map((task) => <article key={task.id}><span><strong>{task.product_name}</strong><Badge status={task.status}>{task.status === 'not_applicable' ? '해당 없음' : '범위 제외'}</Badge></span><p>{exceptionReason(task)}</p></article>)}</div>
              </section>
            )}
            <label htmlFor={noteId}>
              <span className="field-label">최종 확인 메모 {hasExceptions ? <span aria-hidden="true" className="required">*</span> : <small>선택</small>}</span>
              <textarea
                ref={firstFieldRef}
                aria-describedby={errors.note ? noteErrorId : undefined}
                aria-invalid={errors.note ? true : undefined}
                aria-label="최종 확인 메모"
                aria-required={hasExceptions || undefined}
                id={noteId}
                maxLength={2000}
                placeholder="확인한 내용을 적어 주세요."
                value={note}
                onChange={(event) => {
                  setNote(event.target.value)
                  if (errors.note && event.target.value.trim()) setErrors({})
                }}
              />
              {errors.note && <p className="field-error" id={noteErrorId}>{errors.note}</p>}
            </label>
          </>
        ) : (
          <>
            <label htmlFor={reasonId}>
              <span className="field-label">완료 취소 사유 <span aria-hidden="true" className="required">*</span></span>
              <textarea
                ref={firstFieldRef}
                aria-describedby={errors.reason ? reasonErrorId : undefined}
                aria-invalid={errors.reason ? true : undefined}
                aria-label="완료 취소 사유"
                aria-required="true"
                id={reasonId}
                maxLength={2000}
                placeholder="다시 적용해야 하는 이유를 적어 주세요."
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value)
                  if (errors.reason && event.target.value.trim()) setErrors((current) => ({ ...current, reason: undefined }))
                }}
              />
              {errors.reason && <p className="field-error" id={reasonErrorId}>{errors.reason}</p>}
            </label>
            <fieldset aria-describedby={errors.tasks ? tasksErrorId : undefined} className="change-reopen-fieldset">
              <legend>다시 열 제품과 담당자 <span aria-hidden="true" className="required">*</span></legend>
              <div ref={reopenListRef} className="change-reopen-list">
                {reopenableTasks.map((task) => {
                  const checked = task.id in selected
                  return (
                    <div className={checked ? 'change-reopen-row selected' : 'change-reopen-row'} key={task.id}>
                      <label><input checked={checked} onChange={() => toggleTask(task)} type="checkbox" /><span><strong>{task.product_name}</strong><small>기존 담당자 {task.assignee_name ?? '없음'}</small></span></label>
                      {checked && (
                        <select
                          aria-label={`${task.product_name} 담당자`}
                          value={selected[task.id]}
                          onChange={(event) => {
                            setSelected((current) => ({ ...current, [task.id]: event.target.value }))
                            if (errors.tasks) setErrors((current) => ({ ...current, tasks: undefined }))
                          }}
                        >
                          <option value="">담당자 선택</option>
                          {assignees.map((assignee) => <option key={assignee.id} value={assignee.id}>{assignee.name}{assignee.role === 'leader' ? ' (파트장)' : ''}</option>)}
                        </select>
                      )}
                    </div>
                  )
                })}
              </div>
              {errors.tasks && <p className="field-error" id={tasksErrorId}>{errors.tasks}</p>}
            </fieldset>
          </>
        )}

        <DialogActions
          hint={mode === 'finalize' && !summary.can_finalize
            ? '미적용·담당자 없음·확인할 취소를 모두 정리하면 완료할 수 있어요.'
            : undefined}
          onClose={onClose}
        >
          <button
            className={mode === 'undo' ? 'danger' : 'primary'}
            disabled={submitting || (mode === 'finalize' && !summary.can_finalize)}
            type="submit"
          >
            {submitting ? '처리하는 중…' : mode === 'finalize' ? '공통변경 완료하기' : '완료 취소하고 다시 열기'}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
