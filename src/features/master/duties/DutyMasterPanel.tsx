import { useEffect, useState } from 'react'
import { ClipboardList, Download, Plus, Search, Users } from 'lucide-react'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import { ReasonPromptModal } from '../../../components/ui'
import { useViewState } from '../../../hooks/useViewState'
import { downloadCsv } from '../../../lib/csv'
import { roleLabels } from '../../../lib/format'
import { quoted, quotedWithJosa } from '../../../lib/korean'
import { canManageTeamData, canReceiveAssignment } from '../../../domain/permissions'
import { selectDutyTableGroups, selectProductGroups } from '../master.selectors'
import {
  validateDutyCreate,
  validateDutyUpdate,
  validateMajorCategoryCreate,
  validateMajorCategoryUpdate,
} from '../master.validators'
import type { MasterSubPanelProps } from '../shared/types'
import { DutyAssignModal } from './DutyAssignModal'
import { DutyReassignModal, type DutyReassignResult } from './DutyReassignModal'
import { DutyRegisterModal } from './DutyRegisterModal'
import { DutyTable, type DutyEdit, type DutyMajorCategoryEdit } from './DutyTable'
import { MajorCategoryRegisterModal } from './MajorCategoryRegisterModal'
import { useDutyAdminController } from './useDutyAdminController'

export function DutyMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const canManage = canManageTeamData(profile)
  const controller = useDutyAdminController(profile, data, setData)
  const [dutyForm, setDutyForm] = useState({ major_category_id: '', name: '' })
  const [majorCategoryForm, setMajorCategoryForm] = useState({ name: '' })
  const [dutyAssignment, setDutyAssignment] = useState({ user_id: '', duty_id: '' })
  const [adminSearch, setAdminSearch] = useViewState<string>('duties.leader.query', '', (value): value is string => typeof value === 'string')
  const [pendingDelete, setPendingDelete] = useState<PendingAdminDelete | null>(null)
  const [dutyEdits, setDutyEdits] = useState<Record<string, DutyEdit>>({})
  const [majorCategoryEdits, setMajorCategoryEdits] = useState<Record<string, DutyMajorCategoryEdit>>({})
  const [dutyRegisterOpen, setDutyRegisterOpen] = useState(false)
  const [dutyAssignOpen, setDutyAssignOpen] = useState(false)
  const [majorCategoryRegisterOpen, setMajorCategoryRegisterOpen] = useState(false)
  const [reassignDutyId, setReassignDutyId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // 이름·대분류 수정은 저장 전에 변경 사유(감사 이력)를 받는다.
  const [dutyReasonPrompt, setDutyReasonPrompt] = useState<{ kind: 'duty' | 'category'; id: string } | null>(null)
  const [dutyReason, setDutyReason] = useState('')

  const memberOptions = data.profiles.filter(canReceiveAssignment)
  const query = adminSearch.trim()
  const { unassignedDuties } = selectProductGroups(data, query)
  const dutyTableGroups = selectDutyTableGroups(data, query)
  const reassignDuty = reassignDutyId ? data.duties.find((duty) => duty.id === reassignDutyId) ?? null : null

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

  const openDutyRegister = (majorCategoryId?: string) => {
    setDutyForm((current) => ({
      ...current,
      major_category_id: majorCategoryId || current.major_category_id || data.dutyMajorCategories[0]?.id || '',
    }))
    setDutyRegisterOpen(true)
  }

  const addMajorCategory = async () => {
    let createdName = ''
    const ok = await run(() => mutate(async () => {
      const name = validateMajorCategoryCreate(data, majorCategoryForm.name)
      await controller.addCategory({ name })
      createdName = name
      setMajorCategoryForm({ name: '' })
    }, () => `${quotedWithJosa(createdName, '을/를')} 대분류로 등록했어요.`))
    if (ok) setMajorCategoryRegisterOpen(false)
  }

  const addDuty = async () => {
    let createdName = ''
    const ok = await run(() => mutate(async () => {
      const payload = validateDutyCreate(data, {
        majorCategoryId: dutyForm.major_category_id,
        name: dutyForm.name,
      })
      await controller.add({
        majorCategoryId: payload.majorCategoryId,
        name: payload.name,
      })
      createdName = payload.name
      setDutyForm({ major_category_id: dutyForm.major_category_id, name: '' })
    }, () => `${quotedWithJosa(createdName, '을/를')} 업무로 등록했어요.`))
    if (ok) setDutyRegisterOpen(false)
  }

  const assignDuty = async () => {
    // The server decides changed vs. no-op; resolve the toast text after that
    // result is known, not when mutate() is called.
    let noop = false
    const memberName = data.profiles.find((item) => item.id === dutyAssignment.user_id)?.name ?? '파트원'
    const dutyName = data.duties.find((item) => item.id === dutyAssignment.duty_id)?.name ?? '업무'
    const ok = await run(() => mutate(async () => {
      if (!dutyAssignment.user_id) return
      const result = await controller.assign({
        userId: dutyAssignment.user_id,
        dutyId: dutyAssignment.duty_id,
      })
      noop = result.noop
      setDutyAssignment({ user_id: dutyAssignment.user_id, duty_id: '' })
    }, () => noop ? `${memberName}님은 이미 이 업무를 맡고 있어요.` : `${memberName}님에게 ${quotedWithJosa(dutyName, '을/를')} 배정했어요.`))
    if (ok) setDutyAssignOpen(false)
  }

  /** P0-3: 업무 담당자를 빼거나 다른 사람에게 옮긴다. 사유와 함께 담당자 목록을 통째로 저장한다. */
  const saveDutyReassignment = async (result: DutyReassignResult) => {
    if (!reassignDuty) return
    const duty = reassignDuty
    let noop = false
    const ok = await run(() => mutate(async () => {
      const saved = await controller.saveAssignments({
        dutyId: duty.id,
        nextMemberIds: result.nextMemberIds,
        reason: result.reason,
        duty,
        memberOptions: memberOptions.map((member) => ({ id: member.id, name: member.name, email: member.email })),
        expectedUpdatedAt: duty.updated_at ?? null,
      })
      noop = saved.noop
    }, () => noop
      ? '바뀐 내용이 없어요.'
      : result.nextMemberIds.length === 0
        ? `${quoted(duty.name)} 업무의 담당자를 모두 뺐어요.`
        : `${quoted(duty.name)} 업무의 담당자를 바꿨어요.`))
    if (ok) setReassignDutyId(null)
  }

  const saveDutyEdit = (dutyId: string, reason: string) => {
    let noop = false
    let savedName = data.duties.find((item) => item.id === dutyId)?.name ?? '업무'
    return mutate(async () => {
      const edit = dutyEdits[dutyId]
      if (!edit?.name.trim() || !edit.major_category_id) return
      const duty = data.duties.find((item) => item.id === dutyId)
      if (!duty) return
      const payload = validateDutyUpdate(data, dutyId, {
        majorCategoryId: edit.major_category_id,
        name: edit.name,
      })
      savedName = payload.name
      const result = await controller.update(dutyId, {
        name: payload.name,
        major_category_id: payload.majorCategoryId,
        sort_order: duty.sort_order ?? null,
        assignee_label: duty.assignee_label ?? null,
        notes: duty.notes ?? null,
        expectedUpdatedAt: edit.expectedUpdatedAt,
        reason,
      })
      noop = result.noop
      setDutyEdits((current) => {
        const next = { ...current }
        delete next[dutyId]
        return next
      })
    }, () => noop ? '바뀐 내용이 없어요.' : `${quoted(savedName)} 업무를 수정했어요.`)
  }

  const saveMajorCategoryEdit = (majorCategoryId: string, reason: string) => {
    let noop = false
    let savedName = data.dutyMajorCategories.find((item) => item.id === majorCategoryId)?.name ?? '대분류'
    return mutate(async () => {
      const edit = majorCategoryEdits[majorCategoryId]
      if (!edit?.name.trim()) return
      const category = data.dutyMajorCategories.find((item) => item.id === majorCategoryId)
      if (!category) return
      const name = validateMajorCategoryUpdate(data, majorCategoryId, edit.name)
      savedName = name
      const result = await controller.updateCategory(majorCategoryId, {
        name,
        sort_order: category.sort_order ?? null,
        expectedUpdatedAt: edit.expectedUpdatedAt,
        reason,
      })
      noop = result.noop
      setMajorCategoryEdits((current) => {
        const next = { ...current }
        delete next[majorCategoryId]
        return next
      })
    }, () => noop ? '바뀐 내용이 없어요.' : `${quoted(savedName)} 대분류를 수정했어요.`)
  }

  const confirmDutyReasonPrompt = async () => {
    if (!dutyReasonPrompt) return
    const ok = await run(() => dutyReasonPrompt.kind === 'duty'
      ? saveDutyEdit(dutyReasonPrompt.id, dutyReason)
      : saveMajorCategoryEdit(dutyReasonPrompt.id, dutyReason))
    if (ok) {
      setDutyReasonPrompt(null)
      setDutyReason('')
    }
  }

  const deleteDuty = (dutyId: string, input: AuditedDeleteInput) => {
    const name = data.duties.find((item) => item.id === dutyId)?.name ?? '업무'
    return mutate(async () => {
      await controller.remove(dutyId, input)
      setPendingDelete(null)
    }, `${quotedWithJosa(name, '을/를')} 삭제했어요.`)
  }

  const deleteMajorCategory = (majorCategoryId: string, input: AuditedDeleteInput) => {
    const name = data.dutyMajorCategories.find((item) => item.id === majorCategoryId)?.name ?? '대분류'
    return mutate(async () => {
      await controller.removeCategory(majorCategoryId, input)
      setPendingDelete(null)
    }, `${quotedWithJosa(name, '을/를')} 삭제했어요.`)
  }

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <div>
          <h1>업무 카테고리</h1>
          <p>
            대분류 {data.dutyMajorCategories.length}개 · 업무 {data.duties.length}개 · 담당자 없음 {unassignedDuties.length}개
          </p>
        </div>
        {canManage && (
          <button
            className="primary"
            disabled={data.dutyMajorCategories.length === 0}
            onClick={() => openDutyRegister()}
            title={data.dutyMajorCategories.length === 0 ? '대분류를 먼저 등록하면 업무를 추가할 수 있어요.' : undefined}
            type="button"
          >
            <Plus size={16} />
            업무 등록
          </button>
        )}
      </div>
      <div className="admin-header master-header">
        {canManage && <div className="master-header-actions">
          <button className="ghost" onClick={() => setMajorCategoryRegisterOpen(true)} type="button">
            <ClipboardList size={16} />
            대분류 등록
          </button>
          <button className="ghost" onClick={() => setDutyAssignOpen(true)} type="button">
            <Users size={16} />
            업무 배정
          </button>
        </div>}
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="업무 카테고리 검색"
            placeholder="업무명·대분류 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={exportAdminCsv} type="button">
          <Download size={16} />
          CSV 내려받기
        </button>
      </div>

      <DutyTable
        data={data}
        dutyTableGroups={dutyTableGroups}
        dutyEdits={dutyEdits}
        setDutyEdits={setDutyEdits}
        majorCategoryEdits={majorCategoryEdits}
        setMajorCategoryEdits={setMajorCategoryEdits}
        pendingDelete={pendingDelete}
        setPendingDelete={setPendingDelete}
        onSaveDuty={(dutyId) => setDutyReasonPrompt({ kind: 'duty', id: dutyId })}
        onSaveMajorCategory={(majorCategoryId) => setDutyReasonPrompt({ kind: 'category', id: majorCategoryId })}
        onDeleteDuty={deleteDuty}
        onDeleteMajorCategory={deleteMajorCategory}
        onReassignDuty={canManage ? setReassignDutyId : undefined}
        onRegisterCategory={canManage ? () => setMajorCategoryRegisterOpen(true) : undefined}
        onRegisterDuty={canManage ? openDutyRegister : undefined}
        searchActive={Boolean(query)}
        onClearSearch={() => setAdminSearch('')}
        readOnly={!canManage}
      />

      <MajorCategoryRegisterModal
        open={majorCategoryRegisterOpen}
        onClose={() => setMajorCategoryRegisterOpen(false)}
        majorCategoryForm={majorCategoryForm}
        setMajorCategoryForm={setMajorCategoryForm}
        onSubmit={() => void addMajorCategory()}
        submitting={saving}
      />
      <DutyRegisterModal
        open={dutyRegisterOpen}
        onClose={() => setDutyRegisterOpen(false)}
        data={data}
        dutyForm={dutyForm}
        setDutyForm={setDutyForm}
        onSubmit={() => void addDuty()}
        submitting={saving}
      />
      <DutyAssignModal
        open={dutyAssignOpen}
        onClose={() => setDutyAssignOpen(false)}
        memberOptions={memberOptions}
        dutyTableGroups={dutyTableGroups}
        dutyAssignment={dutyAssignment}
        setDutyAssignment={setDutyAssignment}
        onSubmit={() => void assignDuty()}
        submitting={saving}
      />
      {reassignDuty && (
        <DutyReassignModal
          key={reassignDuty.id}
          duty={reassignDuty}
          data={data}
          memberOptions={memberOptions}
          onClose={() => setReassignDutyId(null)}
          onSubmit={(result) => void saveDutyReassignment(result)}
          submitting={saving}
        />
      )}
      <ReasonPromptModal
        open={dutyReasonPrompt !== null}
        onClose={() => {
          setDutyReasonPrompt(null)
          setDutyReason('')
        }}
        title={dutyReasonPrompt?.kind === 'category' ? '대분류 이름을 바꿀까요?' : '업무 정보를 바꿀까요?'}
        description="변경 사유는 감사 이력에 남아요. 다른 파트장도 볼 수 있어요."
        reason={dutyReason}
        setReason={setDutyReason}
        onSubmit={() => void confirmDutyReasonPrompt()}
        submitLabel="저장하기"
        placeholder="예: 업무 이름을 실제 업무에 맞게 바꿔요."
        submitting={saving}
      />
    </div>
  )
}
