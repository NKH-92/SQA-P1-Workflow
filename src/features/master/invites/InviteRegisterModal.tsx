import type { Dispatch, SetStateAction } from 'react'
import { Users } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { Role } from '../../../types'

export function InviteRegisterModal({
  open,
  onClose,
  allowedForm,
  setAllowedForm,
  onSubmit,
}: {
  open: boolean
  onClose: () => void
  allowedForm: { email: string; name: string; role: Role }
  setAllowedForm: Dispatch<SetStateAction<{ email: string; name: string; role: Role }>>
  onSubmit: () => void
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="초대 대상 등록"
      titleId="invite-register-title"
      eyebrow="초대 관리"
      icon={<Users size={18} />}
      closeLabel="초대 등록 닫기"
    >
      <FormGrid
        fields={
          <>
            <label>
              이메일
              <input type="email" value={allowedForm.email} onChange={(event) => setAllowedForm({ ...allowedForm, email: event.target.value })} />
            </label>
            <label>
              이름
              <input value={allowedForm.name} onChange={(event) => setAllowedForm({ ...allowedForm, name: event.target.value })} />
            </label>
            <label>
              역할
              <select value={allowedForm.role} onChange={(event) => setAllowedForm({ ...allowedForm, role: event.target.value as Role })}>
                <option value="member">파트원</option>
                <option value="leader">파트장</option>
              </select>
            </label>
          </>
        }
        onSubmit={onSubmit}
        disabled={!allowedForm.email.trim() || !allowedForm.name.trim()}
        submitLabel="초대 등록"
      />
    </Modal>
  )
}
