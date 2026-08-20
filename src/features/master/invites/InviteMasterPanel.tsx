import { useEffect, useState } from 'react'
import { Download, Search, Upload, UserPlus } from 'lucide-react'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import type { Role } from '../../../types'
import { ReasonPromptModal } from '../../../components/ui'
import { downloadCsv } from '../../../lib/csv'
import { parseCsvRows, parseInviteImportRows } from '../../../lib/csvImport'
import { roleLabels } from '../../../lib/format'
import { canManageTeamData } from '../../../domain/permissions'
import { supabase } from '../../../lib/supabase'
import { selectFilteredAllowedUsers } from '../master.selectors'
import { validateInviteCreate, validateInviteImport, validateInviteUpdate, validateProfileToggle } from '../master.validators'
import type { MasterSubPanelProps } from '../shared/types'
import { ImportDiagnostics, type CsvImportIssue } from '../shared/ImportDiagnostics'
import { InviteCard, type InviteEdit } from './InviteCard'
import { InviteRegisterModal } from './InviteRegisterModal'
import { useInviteAdminController } from './useInviteAdminController'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function InviteMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const canManage = canManageTeamData(profile)
  const controller = useInviteAdminController(profile, data, setData)
  const [allowedForm, setAllowedForm] = useState({ email: '', name: '', role: 'member' as Role })
  const [adminSearch, setAdminSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<PendingAdminDelete | null>(null)
  const [pendingProfileToggle, setPendingProfileToggle] = useState<{ email: string; nextActive: boolean } | null>(null)
  const [profileToggleReason, setProfileToggleReason] = useState('')
  const [inviteEdits, setInviteEdits] = useState<Record<string, InviteEdit>>({})
  const [inviteRegisterOpen, setInviteRegisterOpen] = useState(false)
  // Reason-required update: Save opens this prompt instead of writing directly.
  const [inviteReasonPrompt, setInviteReasonPrompt] = useState<{ inviteId: string } | null>(null)
  const [inviteReason, setInviteReason] = useState('')
  const [inviteImportIssues, setInviteImportIssues] = useState<CsvImportIssue[]>([])
  const [pendingPasswordReset, setPendingPasswordReset] = useState<{ userId: string; name: string } | null>(null)
  const [passwordResetReason, setPasswordResetReason] = useState('')

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

  const importInvitesCsv = async (file: File) => {
    setInviteImportIssues([])
    let rows: ReturnType<typeof parseInviteImportRows>
    try {
      rows = parseInviteImportRows(parseCsvRows(await file.text()))
    } catch (error) {
      // 파일 읽기·파싱 실패도 다른 실패와 같은 경로(오류 토스트)로 보여준다.
      // 호출부가 void로 부르므로 여기서 삼키면 사용자는 성공으로 오해한다.
      await mutate(async () => {
        throw error
      }, '')
      return
    }
    const existingEmails = new Set(data.allowedUsers.map((item) => item.email.toLowerCase()))
    const seen = new Set<string>()
    const issues: CsvImportIssue[] = []
    const incoming = rows.filter((row, index) => {
      const extra = row as { invalidRole?: string }
      const value = row.email || row.name || `데이터 행 ${index + 1}`
      if (!row.email) {
        issues.push({ value, reason: '이메일이 비어 있습니다.' })
        return false
      }
      if (!row.name) {
        issues.push({ value, reason: '이름이 비어 있습니다.' })
        return false
      }
      if (extra.invalidRole) {
        issues.push({ value, reason: `역할 '${extra.invalidRole}'은 파트장, 팀장 또는 파트원이어야 합니다.` })
        return false
      }
      if (!EMAIL_PATTERN.test(row.email)) {
        issues.push({ value, reason: '이메일 형식이 올바르지 않습니다.' })
        return false
      }
      if (existingEmails.has(row.email)) {
        issues.push({ value, reason: '이미 등록된 이메일입니다.' })
        return false
      }
      if (seen.has(row.email)) {
        issues.push({ value, reason: 'CSV 파일 안에서 이메일이 중복되었습니다.' })
        return false
      }
      seen.add(row.email)
      return true
    })
    setInviteImportIssues(issues)
    await mutate(
      async () => {
        validateInviteImport(data, rows.length, incoming.length)
        await controller.importRows(incoming)
      },
      issues.length > 0
        ? `초대 ${incoming.length}건을 가져왔습니다. 제외 ${issues.length}건은 화면의 가져오기 결과에서 확인해 주세요.`
        : `초대 ${incoming.length}건을 가져왔습니다.`,
    )
  }

  const addAllowedUser = async () => {
    const ok = await mutate(async () => {
      const payload = validateInviteCreate(data, allowedForm)
      if (!supabase) throw new Error('Supabase 연결이 필요합니다.')
      const { data: response, error } = await supabase.functions.invoke('account-admin', {
        body: { action: 'create', ...payload },
      })
      if (error) throw error
      if (!response?.ok) throw new Error(response?.message ?? '계정을 생성하지 못했습니다.')
      setAllowedForm({ email: '', name: '', role: 'member' })
    }, '계정을 추가했습니다. 임시 비밀번호는 12345678이며 최초 로그인 시 변경해야 합니다.')
    if (ok) setInviteRegisterOpen(false)
  }

  const resetPassword = async () => {
    if (!pendingPasswordReset || !supabase) return
    const client = supabase
    const ok = await mutate(async () => {
      const { data: response, error } = await client.functions.invoke('account-admin', {
        body: {
          action: 'reset_password',
          userId: pendingPasswordReset.userId,
          reason: passwordResetReason,
        },
      })
      if (error) throw error
      if (!response?.ok) throw new Error(response?.message ?? '비밀번호를 초기화하지 못했습니다.')
    }, '비밀번호를 초기화했습니다. 임시 비밀번호는 12345678이며 다음 로그인 시 변경해야 합니다.')
    if (ok) {
      setPendingPasswordReset(null)
      setPasswordResetReason('')
    }
  }

  const saveInviteEdit = (inviteId: string, reason: string) => {
    let noop = false
    return mutate(async () => {
      const edit = inviteEdits[inviteId]
      if (!edit?.name.trim() || !edit.email.trim()) return
      const payload = validateInviteUpdate(data, inviteId, edit)
      const result = await controller.update(inviteId, {
        ...payload,
        expectedUpdatedAt: edit.expectedUpdatedAt,
        reason,
      })
      // The server-side invite OCC RPC propagates any linked profile role in
      // the same transaction, using the pre-edit email as the stable key.
      noop = result.noop
      setInviteEdits((current) => {
        const next = { ...current }
        delete next[inviteId]
        return next
      })
    }, () => noop ? '변경된 내용이 없습니다.' : '초대 정보를 수정했습니다.')
  }

  const confirmInviteReasonPrompt = async () => {
    if (!inviteReasonPrompt) return
    const ok = await saveInviteEdit(inviteReasonPrompt.inviteId, inviteReason)
    if (ok) {
      setInviteReasonPrompt(null)
      setInviteReason('')
    }
  }

  const toggleProfileActive = (email: string, nextActive: boolean) =>
    mutate(async () => {
      const memberProfile = validateProfileToggle(data, email)
      await controller.toggleProfile(memberProfile.id, nextActive, {
        expectedUpdatedAt: memberProfile.updated_at ?? null,
        reason: profileToggleReason,
      })
      setPendingProfileToggle(null)
      setProfileToggleReason('')
    }, nextActive ? '계정을 활성화했습니다.' : '계정을 비활성화했습니다.')

  const deleteInvite = (inviteId: string, input: AuditedDeleteInput) =>
    mutate(async () => {
      await controller.remove(inviteId, input)
      setPendingDelete(null)
    }, '초대 삭제했습니다.')

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <h1>계정 관리</h1>
        <p>
          등록 {data.allowedUsers.length}명 · 활성 계정 {data.profiles.filter((item) => item.is_active !== false).length}명
        </p>
      </div>
      <div className="admin-header master-header">
        <div className="master-header-actions">
          {canManage && <button className="primary" onClick={() => setInviteRegisterOpen(true)} type="button">
            <UserPlus size={16} />
            계정 추가
          </button>}
        </div>
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="초대 대상 검색"
            placeholder="이름, 제품, 업무 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={exportAdminCsv} type="button">
          <Download size={16} />
          CSV
        </button>
        {canManage && <label className="ghost file-import-btn">
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
        </label>}
      </div>

      <ImportDiagnostics
        id="invite-import-result-title"
        subject="초대"
        issues={inviteImportIssues}
        onClose={() => setInviteImportIssues([])}
      />

      <div className="master-grid">
        {filteredAllowedUsers.map((item) => (
          <InviteCard
            key={item.id}
            item={item}
            data={data}
            inviteEdits={inviteEdits}
            setInviteEdits={setInviteEdits}
            onSave={(inviteId) => setInviteReasonPrompt({ inviteId })}
            pendingDelete={pendingDelete}
            setPendingDelete={setPendingDelete}
            onDelete={deleteInvite}
            pendingProfileToggle={pendingProfileToggle}
            setPendingProfileToggle={(value) => {
              setPendingProfileToggle(value)
              setProfileToggleReason('')
            }}
            profileToggleReason={profileToggleReason}
            setProfileToggleReason={setProfileToggleReason}
            onToggleProfileActive={(email, nextActive) => void toggleProfileActive(email, nextActive)}
            readOnly={!canManage}
            onResetPassword={(userId, name) => {
              setPendingPasswordReset({ userId, name })
              setPasswordResetReason('')
            }}
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
      <ReasonPromptModal
        open={pendingPasswordReset !== null}
        onClose={() => {
          setPendingPasswordReset(null)
          setPasswordResetReason('')
        }}
        title={`${pendingPasswordReset?.name ?? '사용자'} 비밀번호 초기화`}
        description="기존 세션을 종료하고 임시 비밀번호 12345678을 발급합니다. 사용자는 다음 로그인 시 새 비밀번호로 변경해야 합니다."
        reason={passwordResetReason}
        setReason={setPasswordResetReason}
        onSubmit={() => void resetPassword()}
        submitLabel="비밀번호 초기화"
      />
      <ReasonPromptModal
        open={inviteReasonPrompt !== null}
        onClose={() => {
          setInviteReasonPrompt(null)
          setInviteReason('')
        }}
        title="초대 정보 변경 사유"
        description="다른 사용자도 확인할 수 있는 변경 사유를 남겨 주세요."
        reason={inviteReason}
        setReason={setInviteReason}
        onSubmit={() => void confirmInviteReasonPrompt()}
        submitLabel="수정 저장"
      />
    </div>
  )
}
