import type { Dispatch, SetStateAction } from 'react'
import { UserPlus } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { Role } from '../../../types'

export function InviteRegisterModal({
  open,
  onClose,
  allowedForm,
  setAllowedForm,
  onSubmit,
  submitting = false,
}: {
  open: boolean
  onClose: () => void
  allowedForm: { email: string; name: string; role: Role }
  setAllowedForm: Dispatch<SetStateAction<{ email: string; name: string; role: Role }>>
  onSubmit: () => void
  submitting?: boolean
}) {
  const disabledReason = !allowedForm.email.trim()
    ? '이메일을 입력하면 추가할 수 있어요.'
    : '이름을 입력하면 추가할 수 있어요.'
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="계정 추가"
      titleId="invite-register-title"
      description="임시 비밀번호 12345678로 계정을 만들어요. 처음 로그인하면 새 비밀번호로 바꾸게 돼요."
      eyebrow="계정 관리"
      icon={<UserPlus size={18} />}
      closeLabel="계정 추가 닫기"
      dirty={Boolean(allowedForm.email.trim() || allowedForm.name.trim()) && !submitting}
    >
      <FormGrid
        fields={
          <>
            <label>
              <span>이메일 <span aria-hidden="true">*</span></span>
              <input
                aria-required="true"
                autoComplete="off"
                placeholder="name@example.com"
                type="email"
                value={allowedForm.email}
                onChange={(event) => setAllowedForm({ ...allowedForm, email: event.target.value })}
              />
            </label>
            <label>
              <span>이름 <span aria-hidden="true">*</span></span>
              <input
                aria-required="true"
                value={allowedForm.name}
                onChange={(event) => setAllowedForm({ ...allowedForm, name: event.target.value })}
              />
            </label>
            <label>
              역할
              <select value={allowedForm.role} onChange={(event) => setAllowedForm({ ...allowedForm, role: event.target.value as Role })}>
                <option value="member">파트원</option>
                <option value="team_leader">팀장</option>
                <option value="leader">파트장</option>
              </select>
            </label>
          </>
        }
        onSubmit={onSubmit}
        onCancel={onClose}
        disabled={!allowedForm.email.trim() || !allowedForm.name.trim()}
        disabledReason={disabledReason}
        icon={<UserPlus size={16} />}
        submitting={submitting}
        submitLabel="계정 추가하기"
      />
    </Modal>
  )
}
