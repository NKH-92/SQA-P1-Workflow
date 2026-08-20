import type { Dispatch, SetStateAction } from 'react'
import { KeyRound, Pencil, Save } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { deleteWarnings } from '../../../app/constants'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import type { AppData, Role } from '../../../types'
import { roleLabels } from '../../../lib/format'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'

export type InviteEdit = { email: string; name: string; role: Role; expectedUpdatedAt: string | null }

export function InviteCard({
  item,
  data,
  inviteEdits,
  setInviteEdits,
  onSave,
  pendingDelete,
  setPendingDelete,
  onDelete,
  pendingProfileToggle,
  setPendingProfileToggle,
  profileToggleReason,
  setProfileToggleReason,
  onToggleProfileActive,
  readOnly,
  onResetPassword,
}: {
  item: AppData['allowedUsers'][number]
  data: AppData
  inviteEdits: Record<string, InviteEdit>
  setInviteEdits: Dispatch<SetStateAction<Record<string, InviteEdit>>>
  onSave: (inviteId: string) => void
  pendingDelete: PendingAdminDelete | null
  setPendingDelete: (value: PendingAdminDelete | null) => void
  onDelete: (inviteId: string, input: AuditedDeleteInput) => void
  pendingProfileToggle: { email: string; nextActive: boolean } | null
  setPendingProfileToggle: (value: { email: string; nextActive: boolean } | null) => void
  profileToggleReason: string
  setProfileToggleReason: (value: string) => void
  onToggleProfileActive: (email: string, nextActive: boolean) => void
  readOnly: boolean
  onResetPassword: (userId: string, name: string) => void
}) {
  const edit = inviteEdits[item.id]
  const linkedProfile = data.profiles.find((profile) => profile.email.toLowerCase() === item.email.toLowerCase())
  const isActive = linkedProfile?.is_active !== false

  return (
    <article className="master-card">
      {edit && !readOnly ? (
        <div className="project-edit-form">
          <label>
            이메일
            <input
              type="email"
              value={edit.email}
              onChange={(event) => setInviteEdits({ ...inviteEdits, [item.id]: { ...edit, email: event.target.value } })}
            />
          </label>
          <label>
            이름
            <input value={edit.name} onChange={(event) => setInviteEdits({ ...inviteEdits, [item.id]: { ...edit, name: event.target.value } })} />
          </label>
          <label>
            역할
            <select
              value={edit.role}
              onChange={(event) => setInviteEdits({ ...inviteEdits, [item.id]: { ...edit, role: event.target.value as Role } })}
            >
              <option value="member">파트원</option>
              <option value="team_leader">팀장</option>
              <option value="leader">파트장</option>
            </select>
          </label>
          <div className="inline-actions">
            <button
              className="primary compact"
              disabled={!edit.name.trim() || !edit.email.trim()}
              onClick={() => onSave(item.id)}
              type="button"
            >
              <Save size={16} />
              저장
            </button>
            <button
              className="ghost compact"
              onClick={() =>
                setInviteEdits((current) => {
                  const next = { ...current }
                  delete next[item.id]
                  return next
                })
              }
              type="button"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="master-card-head">
            <div>
              <h3>{item.name}</h3>
              <p>{item.email}</p>
            </div>
            {!readOnly && <div className="group-actions">
              <button
                className="ghost compact"
                onClick={() =>
                  setInviteEdits({
                    ...inviteEdits,
                    [item.id]: {
                      email: item.email,
                      name: item.name,
                      role: item.role,
                      expectedUpdatedAt: item.updated_at ?? null,
                    },
                  })
                }
                title="초대 수정"
                type="button"
              >
                <Pencil size={16} />
              </button>
              <DeleteConfirmAction
                table="allowed_users"
                id={item.id}
                expectedUpdatedAt={item.updated_at}
                label="초대"
                itemName={item.email}
                warning={deleteWarnings.allowed_users}
                pendingDelete={pendingDelete}
                setPendingDelete={setPendingDelete}
                onConfirm={(input) => onDelete(item.id, input)}
              />
            </div>}
          </div>
          <div className="inline-actions">
            <Badge status={linkedProfile ? (isActive ? 'approved' : 'rejected') : 'pending'}>
              {linkedProfile ? (isActive ? '활성' : '비활성') : '미가입'}
            </Badge>
            {linkedProfile && !readOnly &&
              (pendingProfileToggle?.email === item.email ? (
                <div className="delete-confirm expanded">
                  <p className="draft-notice">
                    {pendingProfileToggle.nextActive
                      ? '활성화하면 이 사용자가 다시 앱 데이터에 접근할 수 있습니다.'
                      : '비활성화하면 이 사용자는 로그인 후 앱 데이터에 접근할 수 없습니다. 기존 배정은 유지됩니다.'}
                  </p>
                  <label className="wide">
                    변경 사유
                    <textarea
                      maxLength={500}
                      placeholder="예: 퇴사 처리에 따른 계정 비활성화"
                      value={profileToggleReason}
                      onChange={(event) => setProfileToggleReason(event.target.value)}
                    />
                  </label>
                  <div className="inline-actions">
                    <button
                      className="danger compact"
                      disabled={!profileToggleReason.trim()}
                      onClick={() => onToggleProfileActive(item.email, pendingProfileToggle.nextActive)}
                      type="button"
                    >
                      {pendingProfileToggle.nextActive ? '활성화 확인' : '비활성화 확인'}
                    </button>
                    <button className="ghost compact" onClick={() => setPendingProfileToggle(null)} type="button">
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="ghost compact"
                  onClick={() => setPendingProfileToggle({ email: item.email, nextActive: !isActive })}
                  type="button"
                >
                  {isActive ? '비활성화' : '활성화'}
                </button>
              ))}
            {linkedProfile && !readOnly && (
              <button className="ghost compact" onClick={() => onResetPassword(linkedProfile.id, linkedProfile.name)} type="button">
                <KeyRound size={15} />
                비밀번호 초기화
              </button>
            )}
          </div>
          <Badge>{roleLabels[item.role]}</Badge>
        </>
      )}
    </article>
  )
}
