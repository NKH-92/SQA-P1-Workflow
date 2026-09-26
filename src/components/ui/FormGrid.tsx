import type { ReactNode } from 'react'
import { useModalCloseGuard } from './modalContext'

/**
 * 창 안의 짧은 입력 폼. 버튼 줄은 창 표준(오른쪽 정렬, 왼쪽 ‘닫기’, 오른쪽 동사형 행동)을 따른다.
 * 제출 버튼이 비활성일 때는 disabledReason으로 무엇이 빠졌는지 알려준다(이유 없는 비활성 금지).
 */
export function FormGrid({
  fields,
  submitLabel,
  disabled,
  onSubmit,
  onCancel,
  cancelLabel = '닫기',
  icon,
  disabledReason,
  submitting = false,
}: {
  fields: ReactNode
  submitLabel: string
  disabled: boolean
  onSubmit: () => void
  /** 넘기면 제출 버튼 왼쪽에 ‘닫기’ 버튼을 둔다. */
  onCancel?: () => void
  cancelLabel?: string
  /** 새로 만드는 행동에만 쓰는 아이콘(예: 추가). 기본은 아이콘 없음. */
  icon?: ReactNode
  /** 제출 버튼이 비활성인 이유. 예: ‘사유를 입력하면 저장할 수 있어요’ */
  disabledReason?: string
  submitting?: boolean
}) {
  const blocked = disabled || submitting
  const guard = useModalCloseGuard()
  return (
    <form
      aria-busy={submitting || undefined}
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault()
        if (blocked) return
        void onSubmit()
      }}
    >
      {fields}
      <div className="form-grid-actions">
        {disabled && disabledReason && <p className="form-grid-hint">{disabledReason}</p>}
        {onCancel && (
          <button className="ghost" onClick={() => (guard ? guard.guardClose(onCancel) : onCancel())} type="button">
            {cancelLabel}
          </button>
        )}
        <button className="primary" disabled={blocked} type="submit">
          {icon}
          {submitting ? '저장하는 중…' : submitLabel}
        </button>
      </div>
    </form>
  )
}
