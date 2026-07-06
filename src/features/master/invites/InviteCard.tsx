import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Save } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { deleteWarnings } from '../../../app/constants'
import type { AdminDeleteTable } from '../../../app/types'
import type { AppData, Role } from '../../../types'
import { roleLabels } from '../../../lib/format'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'

type InviteEdit = { email: string; name: string; role: Role }

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
  onToggleProfileActive,
}: {
  item: AppData['allowedUsers'][number]
  data: AppData
  inviteEdits: Record<string, InviteEdit>
  setInviteEdits: Dispatch<SetStateAction<Record<string, InviteEdit>>>
  onSave: (inviteId: string) => void
  pendingDelete: { table: AdminDeleteTable; id: string } | null
  setPendingDelete: (value: { table: AdminDeleteTable; id: string } | null) => void
  onDelete: (inviteId: string) => void
  pendingProfileToggle: { email: string; nextActive: boolean } | null
  setPendingProfileToggle: (value: { email: string; nextActive: boolean } | null) => void
  onToggleProfileActive: (email: string, nextActive: boolean) => void
}) {
  const edit = inviteEdits[item.id]
  const linkedProfile = data.profiles.find((profile) => profile.email.toLowerCase() === item.email.toLowerCase())
  const isActive = linkedProfile?.is_active !== false

  return (
    <article className="master-card">
      {edit ? (
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
            <div className="group-actions">
              <button
                className="ghost compact"
                onClick={() => setInviteEdits({ ...inviteEdits, [item.id]: { email: item.email, name: item.name, role: item.role } })}
                title="초대 수정"
                type="button"
              >
                <Pencil size={16} />
              </button>
              <DeleteConfirmAction
                table="allowed_users"
                id={item.id}
                label="초대"
                itemName={item.email}
                warning={deleteWarnings.allowed_users}
                pendingDelete={pendingDelete}
                setPendingDelete={setPendingDelete}
                onConfirm={() => onDelete(item.id)}
              />
            </div>
          </div>
          <div className="inline-actions">
            <Badge status={linkedProfile ? (isActive ? 'approved' : 'rejected') : 'pending'}>
              {linkedProfile ? (isActive ? '활성' : '비활성') : '미가입'}
            </Badge>
            {linkedProfile &&
              (pendingProfileToggle?.email === item.email ? (
                <div className="delete-confirm expanded">
                  <p className="draft-notice">
                    {pendingProfileToggle.nextActive
                      ? '활성화하면 이 사용자가 다시 앱 데이터에 접근할 수 있습니다.'
                      : '비활성화하면 이 사용자는 로그인 후 앱 데이터에 접근할 수 없습니다. 기존 배정은 유지됩니다.'}
                  </p>
                  <div className="inline-actions">
                    <button
                      className="danger compact"
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
          </div>
          <Badge>{roleLabels[item.role]}</Badge>
        </>
      )}
    </article>
  )
}
