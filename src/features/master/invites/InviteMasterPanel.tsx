import { useEffect, useState } from 'react'
import { Download, Search, Upload, Users } from 'lucide-react'
import type { AdminDeleteTable } from '../../../app/types'
import type { Role } from '../../../types'
import { downloadCsv } from '../../../lib/csv'
import { parseCsvRows, parseInviteImportRows } from '../../../lib/csvImport'
import { roleLabels } from '../../../lib/format'
import { canReceiveAssignment } from '../../../domain/permissions'
import {
  addAllowedUser as addAllowedUserMutation,
  createRepositoryContext,
  deleteAllowedUser as deleteAllowedUserRecord,
  importInvites as importInvitesMutation,
  toggleProfileActive as toggleProfileActiveMutation,
  updateInvite as updateInviteMutation,
} from '../../../data'
import { selectFilteredAllowedUsers } from '../master.selectors'
import { validateInviteCreate, validateInviteImport, validateInviteUpdate, validateProfileToggle } from '../master.validators'
import type { MasterSubPanelProps } from '../shared/types'
import { InviteCard } from './InviteCard'
import { InviteRegisterModal } from './InviteRegisterModal'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function InviteMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const [allowedForm, setAllowedForm] = useState({ email: '', name: '', role: 'member' as Role })
  const [adminSearch, setAdminSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ table: AdminDeleteTable; id: string } | null>(null)
  const [pendingProfileToggle, setPendingProfileToggle] = useState<{ email: string; nextActive: boolean } | null>(null)
  const [inviteEdits, setInviteEdits] = useState<Record<string, { email: string; name: string; role: Role }>>({})
  const [inviteRegisterOpen, setInviteRegisterOpen] = useState(false)

  const memberOptions = data.profiles.filter(canReceiveAssignment)
  const query = adminSearch.trim()
  const filteredAllowedUsers = selectFilteredAllowedUsers(data, query)

  useEffect(() => {
    setPendingDelete(null)
  }, [adminSearch])

  const exportAdminCsv = () => {
    downloadCsv('master-data.csv', [
      ...data.allowedUsers.map((item) => ({
        type: 'invite',
        name: item.name,
        email: item.email,
        role: roleLabels[item.role],
      })),
      ...data.productAssignments.map((assignment) => ({
        type: 'product',
        member: assignment.profiles?.name ?? assignment.user_id,
        email: assignment.profiles?.email ?? '',
        target: assignment.products?.name ?? assignment.product_id,
      })),
      ...data.dutyAssignments.map((assignment) => ({
        type: 'duty',
        member: assignment.profiles?.name ?? assignment.user_id,
        email: assignment.profiles?.email ?? '',
        target: assignment.duties?.name ?? assignment.duty_id,
      })),
    ])
  }

  const importInvitesCsv = (file: File) =>
    mutate(async () => {
      const rows = parseInviteImportRows(parseCsvRows(await file.text()))
      const existingEmails = new Set(data.allowedUsers.map((item) => item.email.toLowerCase()))
      const incoming = rows.filter((row) => {
        if (!EMAIL_PATTERN.test(row.email)) return false
        return !existingEmails.has(row.email)
      })
      validateInviteImport(data, rows.length, incoming.length)
      await importInvitesMutation(createRepositoryContext(profile, data, setData), incoming)
    }, '초대 CSV 가져오기를 완료했습니다.')

  const addAllowedUser = async () => {
    const ok = await mutate(async () => {
      const payload = validateInviteCreate(data, allowedForm)
      await addAllowedUserMutation(createRepositoryContext(profile, data, setData), payload)
      setAllowedForm({ email: '', name: '', role: 'member' })
    }, '초대 정보를 등록했습니다.')
    if (ok) setInviteRegisterOpen(false)
  }

  const saveInviteEdit = (inviteId: string) =>
    mutate(async () => {
      const edit = inviteEdits[inviteId]
      if (!edit?.name.trim() || !edit.email.trim()) return
      const payload = validateInviteUpdate(data, inviteId, edit)
      await updateInviteMutation(createRepositoryContext(profile, data, setData), inviteId, payload)
      setInviteEdits((current) => {
        const next = { ...current }
        delete next[inviteId]
        return next
      })
    }, '초대 정보를 수정했습니다.')

  const toggleProfileActive = (email: string, nextActive: boolean) =>
    mutate(async () => {
      const memberProfile = validateProfileToggle(data, email)
      await toggleProfileActiveMutation(createRepositoryContext(profile, data, setData), memberProfile.id, nextActive)
      setPendingProfileToggle(null)
    }, nextActive ? '계정을 활성화했습니다.' : '계정을 비활성화했습니다.')

  const deleteInvite = (inviteId: string) =>
    mutate(async () => {
      await deleteAllowedUserRecord(createRepositoryContext(profile, data, setData), inviteId)
      setPendingDelete(null)
    }, '초대 삭제했습니다.')

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <span>Master / Invitations</span>
        <h1>초대 관리</h1>
        <p>
          초대 {data.allowedUsers.length}명 · 파트원 {memberOptions.length}명
        </p>
      </div>
      <div className="admin-header master-header">
        <div className="master-header-actions">
          <button className="primary" onClick={() => setInviteRegisterOpen(true)} type="button">
            <Users size={16} />
            초대 등록
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="이름, 제품, 업무 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={exportAdminCsv} type="button">
          <Download size={16} />
          CSV
        </button>
        <label className="ghost file-import-btn">
          <Upload size={16} />
          가져오기
          <input
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void importInvitesCsv(file)
              event.target.value = ''
            }}
            type="file"
          />
        </label>
      </div>

      <div className="master-grid">
        {filteredAllowedUsers.map((item) => (
          <InviteCard
            key={item.id}
            item={item}
            data={data}
            inviteEdits={inviteEdits}
            setInviteEdits={setInviteEdits}
            onSave={(inviteId) => void saveInviteEdit(inviteId)}
            pendingDelete={pendingDelete}
            setPendingDelete={setPendingDelete}
            onDelete={deleteInvite}
            pendingProfileToggle={pendingProfileToggle}
            setPendingProfileToggle={setPendingProfileToggle}
            onToggleProfileActive={(email, nextActive) => void toggleProfileActive(email, nextActive)}
          />
        ))}
        {filteredAllowedUsers.length === 0 && <p className="empty">등록된 초대 대상이 없습니다.</p>}
      </div>

      <InviteRegisterModal
        open={inviteRegisterOpen}
        onClose={() => setInviteRegisterOpen(false)}
        allowedForm={allowedForm}
        setAllowedForm={setAllowedForm}
        onSubmit={addAllowedUser}
      />
    </div>
  )
}
