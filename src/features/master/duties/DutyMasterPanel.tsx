import { useEffect, useState } from 'react'
import { ClipboardList, Download, Search, Users } from 'lucide-react'
import type { AdminDeleteTable } from '../../../app/types'
import { downloadCsv } from '../../../lib/csv'
import { roleLabels } from '../../../lib/format'
import { canReceiveAssignment } from '../../../domain/permissions'
import { selectDutyTableGroups, selectProductGroups } from '../master.selectors'
import {
  validateDutyCreate,
  validateDutyUpdate,
  validateMajorCategoryCreate,
  validateMajorCategoryUpdate,
} from '../master.validators'
import type { MasterSubPanelProps } from '../shared/types'
import { DutyAssignModal } from './DutyAssignModal'
import { DutyRegisterModal } from './DutyRegisterModal'
import { DutyTable } from './DutyTable'
import { MajorCategoryRegisterModal } from './MajorCategoryRegisterModal'
import { useDutyAdminController } from './useDutyAdminController'

export function DutyMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const controller = useDutyAdminController(profile, data, setData)
  const [dutyForm, setDutyForm] = useState({ major_category_id: '', name: '' })
  const [majorCategoryForm, setMajorCategoryForm] = useState({ name: '' })
  const [dutyAssignment, setDutyAssignment] = useState({ user_id: '', duty_id: '' })
  const [adminSearch, setAdminSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ table: AdminDeleteTable; id: string } | null>(null)
  const [dutyEdits, setDutyEdits] = useState<Record<string, { major_category_id: string; name: string }>>({})
  const [majorCategoryEdits, setMajorCategoryEdits] = useState<Record<string, { name: string }>>({})
  const [dutyRegisterOpen, setDutyRegisterOpen] = useState(false)
  const [dutyAssignOpen, setDutyAssignOpen] = useState(false)
  const [majorCategoryRegisterOpen, setMajorCategoryRegisterOpen] = useState(false)

  const memberOptions = data.profiles.filter(canReceiveAssignment)
  const query = adminSearch.trim()
  const { unassignedDuties } = selectProductGroups(data, query)
  const dutyTableGroups = selectDutyTableGroups(data, query)

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

  const addMajorCategory = async () => {
    const ok = await mutate(async () => {
      const name = validateMajorCategoryCreate(data, majorCategoryForm.name)
      await controller.addCategory({ name })
      setMajorCategoryForm({ name: '' })
    }, '대분류를 등록했습니다.')
    if (ok) setMajorCategoryRegisterOpen(false)
  }

  const addDuty = async () => {
    const ok = await mutate(async () => {
      const payload = validateDutyCreate(data, {
        majorCategoryId: dutyForm.major_category_id,
        name: dutyForm.name,
      })
      await controller.add({
        majorCategoryId: payload.majorCategoryId,
        name: payload.name,
      })
      setDutyForm({ major_category_id: dutyForm.major_category_id, name: '' })
    }, '업무 카테고리를 등록했습니다.')
    if (ok) setDutyRegisterOpen(false)
  }

  const assignDuty = async () => {
    const ok = await mutate(async () => {
      if (!dutyAssignment.user_id) return
      await controller.assign({
        userId: dutyAssignment.user_id,
        dutyId: dutyAssignment.duty_id,
      })
      setDutyAssignment({ user_id: dutyAssignment.user_id, duty_id: '' })
    }, '담당 업무를 배정했습니다.')
    if (ok) setDutyAssignOpen(false)
  }

  const saveDutyEdit = (dutyId: string) =>
    mutate(async () => {
      const edit = dutyEdits[dutyId]
      if (!edit?.name.trim() || !edit.major_category_id) return
      const payload = validateDutyUpdate(data, dutyId, {
        majorCategoryId: edit.major_category_id,
        name: edit.name,
      })
      await controller.update(dutyId, {
        name: payload.name,
        major_category_id: payload.majorCategoryId,
      })
      setDutyEdits((current) => {
        const next = { ...current }
        delete next[dutyId]
        return next
      })
    }, '업무 카테고리를 수정했습니다.')

  const saveMajorCategoryEdit = (majorCategoryId: string) =>
    mutate(async () => {
      const edit = majorCategoryEdits[majorCategoryId]
      if (!edit?.name.trim()) return
      const name = validateMajorCategoryUpdate(data, majorCategoryId, edit.name)
      await controller.updateCategory(majorCategoryId, {
        name,
      })
      setMajorCategoryEdits((current) => {
        const next = { ...current }
        delete next[majorCategoryId]
        return next
      })
    }, '대분류를 수정했습니다.')

  const deleteDuty = (dutyId: string) =>
    mutate(async () => {
      await controller.remove(dutyId)
      setPendingDelete(null)
    }, '업무 삭제했습니다.')

  const deleteMajorCategory = (majorCategoryId: string) =>
    mutate(async () => {
      await controller.removeCategory(majorCategoryId)
      setPendingDelete(null)
    }, '대분류 삭제했습니다.')

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <h1>업무 카테고리</h1>
        <p>
          대분류 {data.dutyMajorCategories.length}개 · 업무 {data.duties.length}개 · 미배정 {unassignedDuties.length}개
        </p>
      </div>
      <div className="admin-header master-header">
        <div className="master-header-actions">
          <button className="ghost" onClick={() => setMajorCategoryRegisterOpen(true)} type="button">
            <ClipboardList size={16} />
            대분류 등록
          </button>
          <button
            className="primary"
            onClick={() => {
              setDutyForm((current) => ({
                ...current,
                major_category_id: current.major_category_id || data.dutyMajorCategories[0]?.id || '',
              }))
              setDutyRegisterOpen(true)
            }}
            type="button"
          >
            <ClipboardList size={16} />
            업무 등록
          </button>
          <button className="ghost" onClick={() => setDutyAssignOpen(true)} type="button">
            <Users size={16} />
            업무 배정
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
        onSaveDuty={(dutyId) => void saveDutyEdit(dutyId)}
        onSaveMajorCategory={(majorCategoryId) => void saveMajorCategoryEdit(majorCategoryId)}
        onDeleteDuty={deleteDuty}
        onDeleteMajorCategory={deleteMajorCategory}
      />

      <MajorCategoryRegisterModal
        open={majorCategoryRegisterOpen}
        onClose={() => setMajorCategoryRegisterOpen(false)}
        majorCategoryForm={majorCategoryForm}
        setMajorCategoryForm={setMajorCategoryForm}
        onSubmit={addMajorCategory}
      />
      <DutyRegisterModal
        open={dutyRegisterOpen}
        onClose={() => setDutyRegisterOpen(false)}
        data={data}
        dutyForm={dutyForm}
        setDutyForm={setDutyForm}
        onSubmit={addDuty}
      />
      <DutyAssignModal
        open={dutyAssignOpen}
        onClose={() => setDutyAssignOpen(false)}
        memberOptions={memberOptions}
        dutyTableGroups={dutyTableGroups}
        dutyAssignment={dutyAssignment}
        setDutyAssignment={setDutyAssignment}
        onSubmit={assignDuty}
      />
    </div>
  )
}
