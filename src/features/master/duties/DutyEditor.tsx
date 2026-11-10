import { useId, useRef, useState } from 'react'
import { ClipboardList } from 'lucide-react'
import { FormGrid, Modal } from '../../../components/ui'
import type { MutateFn } from '../../../app/types'
import { PRODUCT_DUTY_LABEL, ROTATION_DUTY_LABEL, type DutyAllocationInput } from '../../../data'
import { canReceiveAssignment } from '../../../domain/permissions'
import { toUserMessage } from '../../../lib/errors'
import type { AppData } from '../../../types'
import { isMasterStaleError } from '../shared/masterStale'
import type { DutyGroup, DutyRow } from './dutyRows'

type DutyEditorFocus = 'name' | 'assignment' | 'notes'
export type DutyEditorTarget = { row: DutyRow | null; categoryId: string; focus: DutyEditorFocus }
type DutyAssigneeMode = 'direct' | 'product' | 'rotation' | 'custom' | 'unassigned' | 'legacy'

type DutyEditorValue = {
  name: string
  categoryId: string
  mode: DutyAssigneeMode
  memberIds: string[]
  label: string
  notes: string
  reason: string
}

function initialValue({ row, categoryId }: DutyEditorTarget): DutyEditorValue {
  const label = row?.duty.assignee_label ?? ''
  const memberIds = row?.owners.map((owner) => owner.id) ?? []
  let mode: DutyAssigneeMode = 'unassigned'
  if (memberIds.length) mode = label ? 'legacy' : 'direct'
  else if (label === PRODUCT_DUTY_LABEL) mode = 'product'
  else if (label === ROTATION_DUTY_LABEL) mode = 'rotation'
  else if (label) mode = 'custom'
  return { name: row?.duty.name ?? '', categoryId, mode, memberIds, label, notes: row?.duty.notes ?? '', reason: '' }
}

function dutyAssignment(value: DutyEditorValue, initial: DutyEditorValue): DutyAllocationInput['assignment'] {
  const sameMembers = value.memberIds.length === initial.memberIds.length
    && value.memberIds.every((id) => initial.memberIds.includes(id))
  if (value.mode === initial.mode && (value.mode !== 'direct' || sameMembers)
    && (value.mode !== 'custom' || value.label.trim() === initial.label.trim())) return null
  if (value.mode === 'direct') return { label: null, memberIds: value.memberIds }
  if (value.mode === 'product') return { label: PRODUCT_DUTY_LABEL, memberIds: [] }
  if (value.mode === 'rotation') return { label: ROTATION_DUTY_LABEL, memberIds: [] }
  return { label: value.mode === 'custom' ? value.label.trim() : null, memberIds: [] }
}

export function DutyEditor({
  target,
  latestRow,
  groups,
  profiles,
  mutate,
  onSave,
  onClose,
  onLoadLatest,
  returnFocusRef,
}: {
  target: DutyEditorTarget
  latestRow?: DutyRow
  groups: DutyGroup[]
  profiles: AppData['profiles']
  mutate: MutateFn
  onSave: (input: DutyAllocationInput) => Promise<{ noop: boolean }>
  onClose: () => void
  onLoadLatest: (row: DutyRow) => void
  returnFocusRef: React.RefObject<HTMLElement>
}) {
  const [initial] = useState(() => initialValue(target))
  const [value, setValue] = useState(initial)
  const [memberQuery, setMemberQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [stale, setStale] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false)
  const submittingRef = useRef(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const assignmentRef = useRef<HTMLSelectElement>(null)
  const assignmentId = useId()
  const notesId = useId()
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const row = target.row
  const initialFocus = { name: nameRef, assignment: assignmentRef, notes: notesRef }[target.focus]
  const assignment = dutyAssignment(value, initial)
  const changed = Boolean(assignment) || value.categoryId !== initial.categoryId
    || value.name.trim() !== initial.name.trim() || value.notes.trim() !== initial.notes.trim()
  const removed = assignment ? row?.owners.filter((owner) => !assignment.memberIds.includes(owner.id)) ?? [] : []
  const staleRecord = Boolean(row && (!latestRow || latestRow.duty.updated_at !== row.duty.updated_at))
  const conflict = stale || staleRecord
  const canLoadLatest = Boolean(latestRow && latestRow.duty.updated_at !== row?.duty.updated_at)
  const memberOptions = [
    ...profiles.filter(canReceiveAssignment).map(({ id, name }) => ({ id, name, inactive: false })),
    ...(row?.owners ?? []).filter((owner) => !canReceiveAssignment(profiles.find((profile) => profile.id === owner.id)))
      .map((owner) => ({ ...owner, inactive: true })),
  ].sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
  const visibleMembers = memberOptions.filter((member) => member.name.toLowerCase().includes(memberQuery.trim().toLowerCase()))
  const duplicate = groups.find((group) => group.category.id === value.categoryId)?.rows.some(
    ({ duty }) => duty.id !== row?.duty.id && duty.name.trim() === value.name.trim(),
  )
  const disabledReason = conflict ? '최신 내용을 확인해 주세요.'
    : !value.categoryId ? '대분류를 선택해 주세요.'
    : !value.name.trim() ? '업무명을 입력해 주세요.'
    : duplicate ? '같은 대분류에 이미 있는 업무명이에요.'
    : value.mode === 'direct' && !value.memberIds.length ? '파트원을 선택하거나 담당 방식을 미지정으로 바꿔 주세요.'
    : value.mode === 'custom' && !value.label.trim() ? '담당 표기를 입력해 주세요.'
    : row && !changed ? '수정한 내용이 없어요.'
    : row && !value.reason.trim() ? '변경 사유를 입력해 주세요.' : undefined

  const submit = async () => {
    if (disabledReason || submittingRef.current) return
    submittingRef.current = true
    setSaving(true)
    setError('')
    let noop = false
    try {
      const ok = await mutate(async () => {
        try {
          const result = await onSave({
            name: value.name,
            majorCategoryId: value.categoryId,
            notes: value.notes,
            assignment,
            edit: row ? { id: row.duty.id, expectedUpdatedAt: row.duty.updated_at ?? null, reason: value.reason } : undefined,
          })
          noop = result.noop
        } catch (saveError) {
          if (isMasterStaleError(saveError)) setStale(true)
          else setError(toUserMessage(saveError))
          throw saveError
        }
      }, () => noop ? '바뀐 내용이 없어요.' : row ? '업무분장을 저장했어요.' : '업무를 등록했어요.')
      if (ok) onClose()
    } finally {
      submittingRef.current = false
      setSaving(false)
    }
  }
  const requestClose = () => { if (!submittingRef.current) onClose() }

  return (
    <Modal
      open
      className="duty-editor"
      title={row ? row.duty.name + ' 수정' : '업무 등록'}
      eyebrow="업무분장"
      icon={<ClipboardList size={18} />}
      onClose={requestClose}
      initialFocusRef={initialFocus}
      returnFocusRef={returnFocusRef}
      closeOnBackdrop={false}
      closeOnEscape={!saving}
      dirty={changed || Boolean(value.reason.trim())}
    >
      <FormGrid
        fields={
          <div className="form-grid duty-editor-fields">
            {conflict && <div className="wide duty-conflict">
              <p role="alert">{!latestRow ? '업무가 삭제되었어요. 작성한 내용은 이 창에서 확인할 수 있어요.'
                : '다른 사람이 먼저 수정했어요. 작성한 내용을 확인한 뒤 최신 내용으로 다시 시작할 수 있어요.'}</p>
              {canLoadLatest && !confirmReload && <button type="button" className="ghost compact" onClick={() => setConfirmReload(true)}>
                최신 내용 불러오기
              </button>}
              {canLoadLatest && confirmReload && <div className="inline-actions">
                <span>불러오면 이 창에서 작성한 내용이 지워져요.</span>
                <button type="button" className="ghost compact" onClick={() => setConfirmReload(false)}>계속 확인</button>
                <button type="button" className="primary compact" onClick={() => { if (latestRow) onLoadLatest(latestRow) }}>불러오기</button>
              </div>}
              {latestRow && !canLoadLatest && <p>최신 내용을 받지 못했어요. 입력을 복사한 뒤 목록을 새로고침해 주세요.</p>}
            </div>}
            <label>
              대분류
              <select value={value.categoryId} onChange={(event) => setValue({ ...value, categoryId: event.target.value })} required>
                <option value="">선택</option>
                {groups.map(({ category }) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label>
              업무명
              <input ref={nameRef} value={value.name} maxLength={200} onChange={(event) => setValue({ ...value, name: event.target.value })} required />
            </label>
            <div className="wide duty-assignment-field">
              <label htmlFor={assignmentId}>담당 방식</label>
              <select id={assignmentId} ref={assignmentRef} value={value.mode}
                aria-describedby={value.mode === 'product' || value.mode === 'legacy' ? assignmentId + '-help' : undefined}
                onChange={(event) => setValue({ ...value, mode: event.target.value as DutyAssigneeMode })}>
                {initial.mode === 'legacy' && <option value="legacy">기존 담당자·표기 유지</option>}
                <option value="direct">직접 지정</option>
                <option value="product">{PRODUCT_DUTY_LABEL}</option>
                <option value="rotation">{ROTATION_DUTY_LABEL}</option>
                <option value="custom">기타 표기</option>
                <option value="unassigned">미지정</option>
              </select>
              {value.mode === 'product' && <small id={assignmentId + '-help'}>업무분장에 ‘제품 담당자’로 표시해요.</small>}
              {value.mode === 'legacy' && <small id={assignmentId + '-help'}>{[...(row?.owners ?? []).map((owner) => owner.name), initial.label].join(', ')}</small>}
            </div>
            {value.mode === 'custom' && <label className="wide">
              담당 표기
              <input value={value.label} onChange={(event) => setValue({ ...value, label: event.target.value })} required />
            </label>}
            {value.mode === 'direct' && <fieldset className="wide duty-reassign-members">
              <legend>담당자 · {value.memberIds.length}명 선택</legend>
              <label>
                파트원 검색
                <input type="search" value={memberQuery} onChange={(event) => setMemberQuery(event.target.value)} />
              </label>
              {visibleMembers.length === 0 && <p className="duty-reassign-note">선택할 수 있는 파트원이 없어요.</p>}
              {visibleMembers.map((member) => <label className="duty-reassign-option" key={member.id}>
                <input type="checkbox" checked={value.memberIds.includes(member.id)} onChange={(event) => {
                  const checked = event.target.checked
                  setValue((previous) => ({
                    ...previous,
                    memberIds: checked ? [...previous.memberIds, member.id] : previous.memberIds.filter((id) => id !== member.id),
                  }))
                }} />
                <span>{member.name}{member.inactive ? ' · 현재 배정 유지 가능' : ''}</span>
              </label>)}
            </fieldset>}
            {removed.length > 0 && <p className="wide duty-reassign-summary" role="status">저장하면 담당에서 빠져요 · {removed.map(({ name }) => name).join(', ')}</p>}
            <div className="wide duty-editor-field">
              <label htmlFor={notesId}>비고</label>
              <textarea id={notesId} ref={notesRef} rows={4} value={value.notes} onChange={(event) => setValue({ ...value, notes: event.target.value })} />
            </div>
            {row && <label className="wide">
              변경 사유
              <textarea rows={2} maxLength={500} value={value.reason} onChange={(event) => setValue({ ...value, reason: event.target.value })} required />
              <small>감사 이력에 남아요 · {value.reason.length}/500자</small>
            </label>}
            {error && <p className="wide field-error" role="alert">{error}</p>}
          </div>
        }
        disabled={Boolean(disabledReason)}
        disabledReason={disabledReason}
        submitting={saving}
        onSubmit={() => void submit()}
        onCancel={requestClose}
        cancelLabel="취소"
        submitLabel={row ? '저장하기' : '업무 등록하기'}
      />
    </Modal>
  )
}
