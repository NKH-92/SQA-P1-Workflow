import { useId, useRef, useState, type ReactNode } from 'react'
import { ArchiveRestore, CheckCheck, CheckCircle2, MinusCircle, RefreshCw, UserRoundCog, XCircle } from 'lucide-react'
import { DialogActions, Modal } from '../../../components/ui'
import { withJosa } from '../../../lib/korean'
import type { AppData, ChangeApplication, ProductChangeTask } from '../../../types'

export type ChangeActionDialog =
  | { kind: 'complete'; task: ProductChangeTask }
  | { kind: 'complete_all'; productName: string; tasks: ProductChangeTask[] }
  | { kind: 'not_applicable'; task: ProductChangeTask }
  | { kind: 'reopen'; task: ProductChangeTask }
  | { kind: 'reassign'; task: ProductChangeTask }
  | { kind: 'bulk_reassign'; tasks: ProductChangeTask[] }
  | { kind: 'remove_scope'; task: ProductChangeTask }
  | { kind: 'cancel_application'; application: ChangeApplication }
  | { kind: 'restore_scope'; task: ProductChangeTask }

export type ChangeActionDialogResult = {
  note: string
  reason: string
  assigneeId: string | null
}

type DialogCopy = {
  eyebrow: string
  title: string
  description: string
  submit: string
  icon: ReactNode
  /** 사유 칸 이름. 없으면 사유를 받지 않는다. */
  reasonLabel?: string
  reasonPlaceholder?: string
  danger?: boolean
}

function dialogCopy(dialog: ChangeActionDialog): DialogCopy {
  switch (dialog.kind) {
    case 'complete':
      return {
        eyebrow: '적용 완료',
        title: '이 제품에 변경을 적용했나요?',
        description: '완료로 표시하면 미적용 목록에서 빠지고 처리 이력에 남아요.',
        submit: '적용 완료하기',
        icon: <CheckCircle2 size={18} />,
      }
    case 'complete_all':
      return {
        eyebrow: '모두 적용 완료',
        title: `이 제품의 적용 업무 ${dialog.tasks.length}건을 모두 완료할까요?`,
        description: '한 번에 완료로 표시해요. 완료 메모는 모든 업무에 똑같이 남아요.',
        submit: '모두 적용 완료하기',
        icon: <CheckCheck size={18} />,
      }
    case 'not_applicable':
      return {
        eyebrow: '해당 없음',
        title: '이 제품을 ‘해당 없음’으로 처리할까요?',
        description: '해당 없음으로 처리하면 미적용 목록에서 빠져요. 사유는 처리 이력에 남고 파트장이 최종 확인할 때 봐요.',
        submit: '해당 없음으로 처리하기',
        icon: <MinusCircle size={18} />,
        reasonLabel: '해당 없음 사유',
        reasonPlaceholder: '예: 이 제품은 변경한 원료를 쓰지 않아요.',
      }
    case 'reopen':
      return {
        eyebrow: '다시 열기',
        title: '완료한 업무를 다시 열까요?',
        description: '완료 기록은 활동 이력에 남고, 업무는 미적용 상태로 돌아가요.',
        submit: '다시 열기',
        icon: <RefreshCw size={18} />,
        reasonLabel: '다시 여는 이유',
        reasonPlaceholder: '예: 반영한 내용을 다시 확인해야 해요.',
      }
    case 'reassign':
      return {
        eyebrow: '담당자 변경',
        title: '이 업무의 담당자를 바꿀까요?',
        description: '제품 담당자는 그대로 두고, 이 업무의 담당자만 바꿔요.',
        submit: '담당자 변경',
        icon: <UserRoundCog size={18} />,
        reasonLabel: '담당자를 바꾸는 이유',
        reasonPlaceholder: '예: 담당 제품군이 바뀌었어요.',
      }
    case 'bulk_reassign':
      return {
        eyebrow: '담당자 변경',
        title: `선택한 적용 업무 ${dialog.tasks.length}건의 담당자를 바꿀까요?`,
        description: '제품 담당자는 그대로 두고, 선택한 업무의 담당자만 한 번에 바꿔요.',
        submit: '담당자 변경',
        icon: <UserRoundCog size={18} />,
        reasonLabel: '담당자를 바꾸는 이유',
        reasonPlaceholder: '예: 퇴사한 파트원의 업무를 넘겨요.',
      }
    case 'remove_scope':
      return {
        eyebrow: '적용 범위 제외',
        title: '이 제품을 적용 범위에서 뺄까요?',
        description: '제품은 삭제되지 않아요. 범위에서 뺀 사실과 사유는 이력에 남아요.',
        submit: '범위에서 빼기',
        icon: <XCircle size={18} />,
        reasonLabel: '범위에서 빼는 이유',
        reasonPlaceholder: '예: 이번 변경 대상이 아니에요.',
        danger: true,
      }
    case 'cancel_application':
      return {
        eyebrow: '공통변경 취소',
        title: '공통변경 전체를 취소할까요?',
        description: '아직 처리하지 않은 적용 업무도 함께 취소돼요. 완료·해당 없음 기록은 그대로 남아요.',
        submit: '공통변경 취소하기',
        icon: <XCircle size={18} />,
        reasonLabel: '취소 사유',
        reasonPlaceholder: '예: 공식 변경이 철회됐어요.',
        danger: true,
      }
    case 'restore_scope':
      return {
        eyebrow: '적용 범위 복원',
        title: '이 제품을 적용 범위에 다시 넣을까요?',
        description: '제외했던 기록은 남고, 이 적용 업무는 다시 미적용 상태가 돼요.',
        submit: '범위에 다시 넣기',
        icon: <ArchiveRestore size={18} />,
        reasonLabel: '범위에 다시 넣는 이유',
        reasonPlaceholder: '예: 적용 대상으로 다시 확인됐어요.',
      }
  }
}

function dialogTasks(dialog: ChangeActionDialog): ProductChangeTask[] {
  if ('task' in dialog) return [dialog.task]
  if ('tasks' in dialog) return dialog.tasks
  return []
}

function subjectText(dialog: ChangeActionDialog) {
  if (dialog.kind === 'cancel_application') return `${dialog.application.change_number} · ${dialog.application.title}`
  if (dialog.kind === 'complete_all') return `${dialog.productName} · 적용 업무 ${dialog.tasks.length}건`
  const tasks = dialogTasks(dialog)
  if (tasks.length === 1) return `${tasks[0].product_name} · ${tasks[0].assignee_name ?? '담당자 없음'}`
  const names = tasks.slice(0, 3).map((task) => task.product_name).join(', ')
  return tasks.length > 3 ? `${names} 외 ${tasks.length - 3}건` : names
}

export function ChangeActionModal({
  dialog,
  data,
  onClose,
  onConfirm,
}: {
  dialog: ChangeActionDialog
  data: AppData
  onClose: () => void
  onConfirm: (result: ChangeActionDialogResult) => Promise<boolean>
}) {
  const noteId = useId()
  const reasonId = useId()
  const reasonErrorId = useId()
  const assigneeId = useId()
  const assigneeErrorId = useId()
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errors, setErrors] = useState<{ reason?: string; assignee?: string }>({})
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const assigneeRef = useRef<HTMLSelectElement>(null)
  const isReassign = dialog.kind === 'reassign' || dialog.kind === 'bulk_reassign'
  const [initialAssigneeId] = useState<string | null>(() => {
    if (dialog.kind !== 'reassign' || !dialog.task.assignee_id) return null
    const current = data.profiles.find((item) => item.id === dialog.task.assignee_id)
    return current?.is_active === false ? null : dialog.task.assignee_id
  })
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(initialAssigneeId)
  const activeAssignees = data.changeAssigneeOptions.filter((item) => {
    const assignee = data.profiles.find((profileItem) => profileItem.id === item.id)
    return assignee?.is_active !== false
  })
  const config = dialogCopy(dialog)
  const needsReason = Boolean(config.reasonLabel)
  const takesNote = dialog.kind === 'complete' || dialog.kind === 'complete_all'
  const dirty = Boolean(note.trim() || reason.trim()) || selectedAssigneeId !== initialAssigneeId
  const initialFocusRef = takesNote ? noteRef : isReassign ? assigneeRef : reasonRef

  const submit = () => {
    const nextErrors: { reason?: string; assignee?: string } = {}
    if (isReassign && !selectedAssigneeId) nextErrors.assignee = '새 담당자를 골라 주세요.'
    if (needsReason && !reason.trim()) nextErrors.reason = `${withJosa(config.reasonLabel!, '을/를')} 적어 주세요.`
    setErrors(nextErrors)
    if (nextErrors.assignee) {
      assigneeRef.current?.focus()
      return
    }
    if (nextErrors.reason) {
      reasonRef.current?.focus()
      return
    }
    setSubmitting(true)
    void onConfirm({ note, reason, assigneeId: selectedAssigneeId }).then((ok) => {
      setSubmitting(false)
      if (ok) onClose()
    })
  }

  return (
    <Modal
      open
      onClose={onClose}
      eyebrow={config.eyebrow}
      title={config.title}
      description={config.description}
      icon={config.icon}
      className="change-action-modal"
      initialFocusRef={initialFocusRef}
      dirty={dirty && !submitting}
    >
      <form
        aria-busy={submitting || undefined}
        className="change-action-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          if (!submitting) submit()
        }}
      >
        <div className="change-action-subject">{subjectText(dialog)}</div>

        {takesNote && (
          <label htmlFor={noteId}>
            <span className="field-label">완료 메모 <small>선택</small></span>
            <textarea
              ref={noteRef}
              id={noteId}
              maxLength={2000}
              placeholder="예: 제품표준서 Rev.12 반영"
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </label>
        )}

        {isReassign && (
          <label htmlFor={assigneeId}>
            <span className="field-label">새 담당자 <span aria-hidden="true" className="required">*</span></span>
            <select
              ref={assigneeRef}
              aria-describedby={errors.assignee ? assigneeErrorId : undefined}
              aria-invalid={errors.assignee ? true : undefined}
              aria-label="새 담당자"
              aria-required="true"
              id={assigneeId}
              value={selectedAssigneeId ?? ''}
              onChange={(event) => {
                setSelectedAssigneeId(event.target.value || null)
                if (errors.assignee) setErrors((current) => ({ ...current, assignee: undefined }))
              }}
            >
              <option disabled value="">담당자를 선택해 주세요</option>
              {activeAssignees.map((item) => <option key={item.id} value={item.id}>{item.name}{item.role === 'leader' ? ' (파트장)' : ''}</option>)}
            </select>
            {errors.assignee && <p className="field-error" id={assigneeErrorId}>{errors.assignee}</p>}
          </label>
        )}

        {needsReason && (
          <label htmlFor={reasonId}>
            <span className="field-label">{config.reasonLabel} <span aria-hidden="true" className="required">*</span></span>
            <textarea
              ref={reasonRef}
              aria-describedby={errors.reason ? reasonErrorId : undefined}
              aria-invalid={errors.reason ? true : undefined}
              aria-label={config.reasonLabel}
              aria-required="true"
              id={reasonId}
              maxLength={2000}
              placeholder={config.reasonPlaceholder}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value)
                if (errors.reason && event.target.value.trim()) setErrors((current) => ({ ...current, reason: undefined }))
              }}
            />
            {errors.reason && <p className="field-error" id={reasonErrorId}>{errors.reason}</p>}
          </label>
        )}

        <DialogActions onClose={onClose}>
          <button className={config.danger ? 'danger' : 'primary'} disabled={submitting} type="submit">
            {submitting ? '처리하는 중…' : config.submit}
          </button>
        </DialogActions>
      </form>
    </Modal>
  )
}
