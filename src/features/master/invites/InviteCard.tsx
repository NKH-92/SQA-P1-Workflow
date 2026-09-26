import { useId, type Dispatch, type SetStateAction } from 'react'
import { KeyRound, Pencil, Power, Trash2 } from 'lucide-react'
import { Badge, OverflowMenu } from '../../../components/ui'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import type { AppData, Role } from '../../../types'
import { roleLabels } from '../../../lib/format'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'
import { masterDeleteWarnings } from '../shared/deleteCopy'

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
  const toggleReasonId = useId()
  const edit = inviteEdits[item.id]
  const linkedProfile = data.profiles.find((profile) => profile.email.toLowerCase() === item.email.toLowerCase())
  const isActive = linkedProfile?.is_active !== false
  const statusLabel = linkedProfile ? (isActive ? '활성 계정' : '비활성 계정') : '가입 전'
  const confirmingToggle = pendingProfileToggle?.email === item.email

  const startEdit = () =>
    setInviteEdits({
      ...inviteEdits,
      [item.id]: {
        email: item.email,
        name: item.name,
        role: item.role,
        expectedUpdatedAt: item.updated_at ?? null,
      },
    })

  return (
    <article className="master-card invite-card" data-status={linkedProfile ? (isActive ? 'active' : 'inactive') : 'pending'}>
      {edit && !readOnly ? (
        <div className="project-edit-form">
          <label>
            이메일
            <input
              autoFocus
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
              닫기
            </button>
            <button
              className="primary compact"
              disabled={!edit.name.trim() || !edit.email.trim()}
              onClick={() => onSave(item.id)}
              type="button"
            >
              저장
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="master-card-head">
            <div>
              <h3>{item.name}</h3>
              <p className="invite-card-email">{item.email}</p>
            </div>
            {!readOnly && (
              <OverflowMenu
                label={`${item.name} 계정 더보기`}
                items={[
                  { label: '계정 정보 수정', icon: <Pencil aria-hidden="true" size={15} />, onSelect: startEdit },
                  {
                    label: '목록에서 삭제',
                    icon: <Trash2 aria-hidden="true" size={15} />,
                    danger: true,
                    onSelect: () => setPendingDelete({
                      table: 'allowed_users',
                      id: item.id,
                      expectedUpdatedAt: item.updated_at ?? null,
                    }),
                  },
                ]}
              />
            )}
          </div>
          <div className="invite-card-status">
            <Badge>{roleLabels[item.role]}</Badge>
            <span className="invite-status-chip" data-status={linkedProfile ? (isActive ? 'active' : 'inactive') : 'pending'}>
              <span aria-hidden="true" className="invite-status-dot" />
              {statusLabel}
            </span>
          </div>
          {linkedProfile && !readOnly && (confirmingToggle ? (
            <div className="delete-confirm expanded invite-toggle-confirm" role="group" aria-label={`${item.name} 계정 ${pendingProfileToggle.nextActive ? '활성화' : '비활성화'} 확인`}>
              <p className="draft-notice">
                {pendingProfileToggle.nextActive
                  ? '활성화하면 이 사람이 다시 앱을 쓸 수 있어요.'
                  : '비활성화하면 이 사람은 로그인해도 앱을 쓸 수 없어요. 배정된 업무는 그대로 남아요.'}
              </p>
              <label className="wide" htmlFor={toggleReasonId}>
                변경 사유
                <textarea
                  autoFocus
                  id={toggleReasonId}
                  maxLength={500}
                  placeholder={pendingProfileToggle.nextActive ? '예: 복직해서 다시 활성화해요.' : '예: 퇴사로 계정을 비활성화해요.'}
                  value={profileToggleReason}
                  onChange={(event) => setProfileToggleReason(event.target.value)}
                />
              </label>
              <div className="inline-actions">
                <button className="ghost compact" onClick={() => setPendingProfileToggle(null)} type="button">
                  닫기
                </button>
                <button
                  className={pendingProfileToggle.nextActive ? 'primary compact' : 'danger compact'}
                  disabled={!profileToggleReason.trim()}
                  onClick={() => onToggleProfileActive(item.email, pendingProfileToggle.nextActive)}
                  title={!profileToggleReason.trim() ? '변경 사유를 적으면 누를 수 있어요.' : undefined}
                  type="button"
                >
                  {pendingProfileToggle.nextActive ? '활성화하기' : '비활성화하기'}
                </button>
              </div>
            </div>
          ) : (
            <div className="inline-actions invite-card-actions">
              <button
                aria-label={`${item.name} 계정 ${isActive ? '비활성화' : '활성화'}`}
                className="ghost compact"
                onClick={() => setPendingProfileToggle({ email: item.email, nextActive: !isActive })}
                type="button"
              >
                <Power aria-hidden="true" size={15} />
                {isActive ? '비활성화' : '활성화'}
              </button>
              <button className="ghost compact" onClick={() => onResetPassword(linkedProfile.id, linkedProfile.name)} type="button">
                <KeyRound aria-hidden="true" size={15} />
                비밀번호 초기화
              </button>
            </div>
          ))}
          {!readOnly && (
            <DeleteConfirmAction
              hideTrigger
              table="allowed_users"
              id={item.id}
              expectedUpdatedAt={item.updated_at}
              label="계정"
              itemName={item.email}
              warning={masterDeleteWarnings.allowedUser}
              pendingDelete={pendingDelete}
              setPendingDelete={setPendingDelete}
              onConfirm={(input) => onDelete(item.id, input)}
            />
          )}
        </>
      )}
    </article>
  )
}
