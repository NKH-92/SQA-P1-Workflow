import { useEffect, useState } from 'react'
import { Download, Search, Upload, UserPlus, Users } from 'lucide-react'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import type { Role } from '../../../types'
import { EmptyState, ReasonPromptModal } from '../../../components/ui'
import { useViewState } from '../../../hooks/useViewState'
import { downloadCsv } from '../../../lib/csv'
import { parseCsvRows, parseInviteImportRows } from '../../../lib/csvImport'
import { UserFacingError } from '../../../lib/errors'
import { roleLabels } from '../../../lib/format'
import { canManageTeamData } from '../../../domain/permissions'
import { supabase } from '../../../lib/supabase'
import { selectFilteredAllowedUsers } from '../master.selectors'
import { validateInviteCreate, validateInviteImport, validateInviteUpdate, validateProfileToggle } from '../master.validators'
import type { MasterSubPanelProps } from '../shared/types'
import { ImportDiagnostics, type CsvImportIssue } from '../shared/ImportDiagnostics'
import { assertAccountAdminResult } from './accountAdminErrors'
import { InviteCard, type InviteEdit } from './InviteCard'
import { InviteRegisterModal } from './InviteRegisterModal'
import { useInviteAdminController } from './useInviteAdminController'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEMPORARY_PASSWORD = '12345678'

export function InviteMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const canManage = canManageTeamData(profile)
  const controller = useInviteAdminController(profile, data, setData)
  const [allowedForm, setAllowedForm] = useState({ email: '', name: '', role: 'member' as Role })
  const [adminSearch, setAdminSearch] = useViewState<string>('invites.leader.query', '', (value): value is string => typeof value === 'string')
  const [pendingDelete, setPendingDelete] = useState<PendingAdminDelete | null>(null)
  const [pendingProfileToggle, setPendingProfileToggle] = useState<{ email: string; nextActive: boolean } | null>(null)
  const [profileToggleReason, setProfileToggleReason] = useState('')
  const [inviteEdits, setInviteEdits] = useState<Record<string, InviteEdit>>({})
  const [inviteRegisterOpen, setInviteRegisterOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // 계정 정보 수정은 저장 전에 변경 사유(감사 이력)를 받는다.
  const [inviteReasonPrompt, setInviteReasonPrompt] = useState<{ inviteId: string } | null>(null)
  const [inviteReason, setInviteReason] = useState('')
  const [inviteImportIssues, setInviteImportIssues] = useState<CsvImportIssue[]>([])
  const [pendingPasswordReset, setPendingPasswordReset] = useState<{ userId: string; name: string } | null>(null)
  const [passwordResetReason, setPasswordResetReason] = useState('')

  const query = adminSearch.trim()
  const filteredAllowedUsers = selectFilteredAllowedUsers(data, query)
  const inviteName = (inviteId: string) => data.allowedUsers.find((item) => item.id === inviteId)?.name ?? '계정'

  useEffect(() => {
    setPendingDelete(null)
  }, [adminSearch])

  const run = async (operation: () => Promise<boolean>) => {
    setSaving(true)
    try {
      return await operation()
    } finally {
      setSaving(false)
    }
  }

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
      const value = row.email || row.name || `${index + 1}번째 행`
      if (!row.email) {
        issues.push({ value, reason: '이메일이 비어 있어요.' })
        return false
      }
      if (!row.name) {
        issues.push({ value, reason: '이름이 비어 있어요.' })
        return false
      }
      if (extra.invalidRole) {
        issues.push({ value, reason: `역할은 파트장, 팀장, 파트원 중 하나로 적어 주세요. (입력값: ${extra.invalidRole})` })
        return false
      }
      if (!EMAIL_PATTERN.test(row.email)) {
        issues.push({ value, reason: '이메일 형식을 확인해 주세요.' })
        return false
      }
      if (existingEmails.has(row.email)) {
        issues.push({ value, reason: '이미 등록된 이메일이에요.' })
        return false
      }
      if (seen.has(row.email)) {
        issues.push({ value, reason: 'CSV 파일 안에 같은 이메일이 두 번 있어요.' })
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
        ? `계정 ${incoming.length}개를 가져왔어요. 가져오지 않은 ${issues.length}개는 아래 결과에서 확인해 주세요.`
        : `계정 ${incoming.length}개를 가져왔어요.`,
    )
  }

  const addAllowedUser = async () => {
    const ok = await run(() => mutate(async () => {
      const payload = validateInviteCreate(data, allowedForm)
      if (!supabase) {
        // 미리보기(데모)에서는 서버 계정 없이 목록에만 추가한다.
        await controller.add(payload)
      } else {
        const result = await supabase.functions.invoke('account-admin', {
          body: { action: 'create', ...payload },
        })
        await assertAccountAdminResult(result, 'create')
      }
      setAllowedForm({ email: '', name: '', role: 'member' })
    }, {
      // 임시 비밀번호는 전달해야 하는 정보라 사용자가 닫을 때까지 남긴다.
      text: `계정을 추가했어요. 임시 비밀번호 ${TEMPORARY_PASSWORD}을 전달해 주세요. 처음 로그인하면 새 비밀번호로 바꿔야 해요.`,
      persistent: true,
    }))
    if (ok) setInviteRegisterOpen(false)
  }

  const resetPassword = async () => {
    if (!pendingPasswordReset) return
    const target = pendingPasswordReset
    const ok = await run(() => mutate(async () => {
      if (!supabase) {
        throw new UserFacingError('미리보기에서는 비밀번호를 초기화하지 않아요. 실제 서비스에서 시도해 주세요.')
      }
      const result = await supabase.functions.invoke('account-admin', {
        body: {
          action: 'reset_password',
          userId: target.userId,
          reason: passwordResetReason,
        },
      })
      await assertAccountAdminResult(result, 'reset_password')
    }, {
      text: `${target.name}님 비밀번호를 초기화했어요. 임시 비밀번호 ${TEMPORARY_PASSWORD}을 전달해 주세요. 다음 로그인 때 새 비밀번호로 바꿔야 해요.`,
      persistent: true,
    }))
    if (ok) {
      setPendingPasswordReset(null)
      setPasswordResetReason('')
    }
  }

  const saveInviteEdit = (inviteId: string, reason: string) => {
    let noop = false
    let savedName = inviteName(inviteId)
    return mutate(async () => {
      const edit = inviteEdits[inviteId]
      if (!edit?.name.trim() || !edit.email.trim()) return
      const payload = validateInviteUpdate(data, inviteId, edit)
      savedName = payload.name
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
    }, () => noop ? '바뀐 내용이 없어요.' : `${savedName}님 계정 정보를 수정했어요.`)
  }

  const confirmInviteReasonPrompt = async () => {
    if (!inviteReasonPrompt) return
    const ok = await run(() => saveInviteEdit(inviteReasonPrompt.inviteId, inviteReason))
    if (ok) {
      setInviteReasonPrompt(null)
      setInviteReason('')
    }
  }

  const toggleProfileActive = (email: string, nextActive: boolean) => {
    const name = data.allowedUsers.find((item) => item.email === email)?.name ?? '계정'
    return mutate(async () => {
      const memberProfile = validateProfileToggle(data, email)
      await controller.toggleProfile(memberProfile.id, nextActive, {
        expectedUpdatedAt: memberProfile.updated_at ?? null,
        reason: profileToggleReason,
      })
      setPendingProfileToggle(null)
      setProfileToggleReason('')
    }, nextActive ? `${name}님 계정을 활성화했어요.` : `${name}님 계정을 비활성화했어요.`)
  }

  const deleteInvite = (inviteId: string, input: AuditedDeleteInput) => {
    const name = inviteName(inviteId)
    return mutate(async () => {
      await controller.remove(inviteId, input)
      setPendingDelete(null)
    }, `${name}님 계정을 목록에서 삭제했어요.`)
  }

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <div>
          <h1>계정 관리</h1>
          <p>
            등록 {data.allowedUsers.length}명 · 활성 계정 {data.profiles.filter((item) => item.is_active !== false).length}명
          </p>
        </div>
        {canManage && (
          <button className="primary" onClick={() => setInviteRegisterOpen(true)} type="button">
            <UserPlus size={16} />
            계정 추가
          </button>
        )}
      </div>
      <div className="admin-header master-header">
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="계정 검색"
            placeholder="이름·이메일·역할 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={exportAdminCsv} type="button">
          <Download size={16} />
          CSV 내려받기
        </button>
        {canManage && <label className="ghost file-import-btn">
          <Upload size={16} />
          CSV 가져오기
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
        subject="계정"
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
      </div>
      {filteredAllowedUsers.length === 0 && (
        <EmptyState
          icon={<Users size={22} />}
          title={query ? '조건에 맞는 계정이 없어요' : '등록된 계정이 없어요'}
          description={query ? '다른 검색어로 찾아보세요.' : canManage ? '계정을 추가하면 임시 비밀번호로 로그인할 수 있어요.' : undefined}
          action={query
            ? <button className="ghost compact" onClick={() => setAdminSearch('')} type="button">검색어 지우기</button>
            : canManage
              ? <button className="ghost compact" onClick={() => setInviteRegisterOpen(true)} type="button"><UserPlus size={14} />계정 추가</button>
              : undefined}
        />
      )}

      <InviteRegisterModal
        open={inviteRegisterOpen}
        onClose={() => setInviteRegisterOpen(false)}
        allowedForm={allowedForm}
        setAllowedForm={setAllowedForm}
        onSubmit={() => void addAllowedUser()}
        submitting={saving}
      />
      <ReasonPromptModal
        open={pendingPasswordReset !== null}
        onClose={() => {
          setPendingPasswordReset(null)
          setPasswordResetReason('')
        }}
        title={`${pendingPasswordReset?.name ?? '이 계정'}님 비밀번호를 초기화할까요?`}
        description={`로그인된 모든 기기에서 로그아웃되고, 비밀번호가 ${TEMPORARY_PASSWORD}로 바뀌어요. 다음 로그인 때 새 비밀번호를 만들어야 해요.`}
        reason={passwordResetReason}
        setReason={setPasswordResetReason}
        onSubmit={() => void resetPassword()}
        submitLabel="비밀번호 초기화하기"
        label="초기화 사유"
        placeholder="예: 비밀번호를 잊어버렸다고 요청했어요."
        submitting={saving}
      />
      <ReasonPromptModal
        open={inviteReasonPrompt !== null}
        onClose={() => {
          setInviteReasonPrompt(null)
          setInviteReason('')
        }}
        title="계정 정보를 바꿀까요?"
        description="변경 사유는 감사 이력에 남아요. 다른 파트장도 볼 수 있어요."
        reason={inviteReason}
        setReason={setInviteReason}
        onSubmit={() => void confirmInviteReasonPrompt()}
        submitLabel="저장하기"
        placeholder="예: 역할이 바뀌었어요."
        submitting={saving}
      />
    </div>
  )
}
