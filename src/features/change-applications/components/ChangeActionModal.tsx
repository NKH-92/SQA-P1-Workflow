import { useRef, useState } from 'react'
import { AlertTriangle, ArchiveRestore, CheckCircle2, RefreshCw, UserRoundCog, XCircle } from 'lucide-react'
import { Modal } from '../../../components/ui'
import type { AppData, ChangeApplication, ProductChangeTask } from '../../../types'

export type ChangeActionDialog =
  | { kind: 'complete'; task: ProductChangeTask }
  | { kind: 'not_applicable'; task: ProductChangeTask }
  | { kind: 'reopen'; task: ProductChangeTask }
  | { kind: 'reassign'; task: ProductChangeTask }
  | { kind: 'remove_scope'; task: ProductChangeTask }
  | { kind: 'cancel_application'; application: ChangeApplication }
  | { kind: 'restore_scope'; task: ProductChangeTask }

export type ChangeActionDialogResult = {
  note: string
  reason: string
  assigneeId: string | null
}

const copy = {
  complete: {
    eyebrow: '적용 완료',
    title: '실제로 적용을 완료했습니까?',
    description: '완료 후 기본 미적용 목록에서 사라지고 완료 이력에 보관됩니다.',
    submit: '완료 확인',
    icon: <CheckCircle2 size={18} />,
  },
  not_applicable: {
    eyebrow: '예외 처리',
    title: '이 제품은 적용 대상이 아닙니까?',
    description: '해당 없음 사유는 필수이며 처리 이력에 계속 남습니다.',
    submit: '해당 없음 처리',
    icon: <AlertTriangle size={18} />,
  },
  reopen: {
    eyebrow: '처리 재개',
    title: '완료 처리를 다시 열까요?',
    description: '기존 완료 정보는 활동 이력에 남고 업무 상태는 미적용으로 돌아갑니다.',
    submit: '다시 열기',
    icon: <RefreshCw size={18} />,
  },
  reassign: {
    eyebrow: '담당자 변경',
    title: '적용 책임자를 변경합니다',
    description: '제품의 현재 담당 배정과 별개로 이 업무에 저장된 책임자만 변경합니다.',
    submit: '담당자 변경',
    icon: <UserRoundCog size={18} />,
  },
  remove_scope: {
    eyebrow: '적용범위 제외',
    title: '이 제품을 적용범위에서 제외할까요?',
    description: '제품은 삭제되지 않고 범위 제외 상태와 사유가 이력에 남습니다.',
    submit: '범위 제외',
    icon: <XCircle size={18} />,
  },
  cancel_application: {
    eyebrow: '변경건 취소',
    title: '변경건 전체를 취소할까요?',
    description: '처리되지 않은 제품 업무가 함께 취소되며 완료·해당 없음 이력은 유지됩니다.',
    submit: '변경건 취소',
    icon: <XCircle size={18} />,
  },
  restore_scope: {
    eyebrow: '적용범위 복원',
    title: '이 제품을 적용범위에 복원할까요?',
    description: '기존 제외 이력은 유지되고 제품 적용업무가 다시 미적용 상태로 돌아갑니다.',
    submit: '적용범위 복원',
    icon: <ArchiveRestore size={18} />,
  },
} as const

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
  const [note, setNote] = useState('')
  const [reason, setReason] = useState('')
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const reasonRef = useRef<HTMLTextAreaElement>(null)
  const assigneeRef = useRef<HTMLSelectElement>(null)
  const [assigneeId, setAssigneeId] = useState<string | null>(() => {
    if (!('task' in dialog) || !dialog.task.assignee_id) return null
    const current = data.profiles.find((item) => item.id === dialog.task.assignee_id)
    return current?.is_active === false ? null : dialog.task.assignee_id
  })
  const activeAssignees = data.changeAssigneeOptions.filter((item) => {
    const assignee = data.profiles.find((profileItem) => profileItem.id === item.id)
    return assignee?.is_active !== false
  })
  const config = copy[dialog.kind]
  const task = 'task' in dialog ? dialog.task : null
  const needsReason = dialog.kind !== 'complete'
  const reasonLabel = dialog.kind === 'not_applicable'
    ? '해당 없음 사유'
    : dialog.kind === 'reopen'
      ? '재개 사유'
      : dialog.kind === 'reassign'
        ? '재배정 사유'
        : dialog.kind === 'restore_scope'
          ? '적용범위 복원 사유'
          : dialog.kind === 'remove_scope'
            ? '적용범위 제외 사유'
            : '취소 사유'
  const canSubmit = dialog.kind === 'complete'
    ? true
    : Boolean(reason.trim())
      && (dialog.kind !== 'reassign' || Boolean(assigneeId))

  const subject = task
    ? `${task.product_name} · ${task.assignee_name ?? '담당 미지정'}`
    : 'application' in dialog ? dialog.application.change_number : ''
  const initialFocusRef = dialog.kind === 'complete'
    ? noteRef
    : dialog.kind === 'reassign'
      ? assigneeRef
      : reasonRef

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
    >
      <form
        className="change-action-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!canSubmit) return
          void onConfirm({ note, reason, assigneeId }).then((ok) => {
            if (ok) onClose()
          })
        }}
      >
        <div className="change-action-subject">{subject}</div>

        {dialog.kind === 'complete' && (
          <label>
            완료 메모 <small>선택</small>
            <textarea ref={noteRef} maxLength={2000} placeholder="예: 제품표준서 Rev.12 반영" value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        )}

        {dialog.kind === 'reassign' && (
          <label>
            새 적용 책임자
            <select ref={assigneeRef} aria-label="새 적용 책임자" value={assigneeId ?? ''} onChange={(event) => setAssigneeId(event.target.value || null)}>
              <option disabled value="">책임자를 선택해 주세요</option>
              {activeAssignees.map((item) => <option key={item.id} value={item.id}>{item.name}{item.role === 'leader' ? ' (파트장)' : ''}</option>)}
            </select>
          </label>
        )}

        {needsReason && (
          <label>
            {reasonLabel} <span className="required">*</span>
            <textarea ref={reasonRef} aria-label={reasonLabel} maxLength={2000} placeholder="처리 사유를 입력해 주세요." value={reason} onChange={(event) => setReason(event.target.value)} />
          </label>
        )}

        <footer className="modal-footer">
          <button className="ghost" onClick={onClose} type="button">닫기</button>
          <button className={dialog.kind.startsWith('cancel') || dialog.kind === 'remove_scope' ? 'danger' : 'primary'} disabled={!canSubmit} type="submit">{config.submit}</button>
        </footer>
      </form>
    </Modal>
  )
}
