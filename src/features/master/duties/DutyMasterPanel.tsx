import { useMemo, useRef, useState } from 'react'
import { ClipboardList, Download, Plus, Printer, Search } from 'lucide-react'
import { FormGrid, Modal, OverflowMenu } from '../../../components/ui'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import { canManageTeamData } from '../../../domain/permissions'
import { useViewState } from '../../../hooks/useViewState'
import { quotedWithJosa } from '../../../lib/korean'
import type { DutyMajorCategory } from '../../../types'
import { OfficePlace } from '../../office/components/OfficePlace'
import { validateMajorCategoryCreate, validateMajorCategoryUpdate } from '../master.validators'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'
import { masterDeleteWarnings } from '../shared/deleteCopy'
import { isMasterStaleError } from '../shared/masterStale'
import type { MasterSubPanelProps } from '../shared/types'
import { DutyEditor, type DutyEditorTarget } from './DutyEditor'
import { DutyReportDialog, type DutyReportTarget } from './DutyReportDialog'
import { DutyTable } from './DutyTable'
import { dutyQuickFilters, dutyReportRows, filterDutyGroups, matchesDutyQuickFilter, selectDutyGroups, type DutyQuickFilter } from './dutyRows'
import { useDutyAdminController } from './useDutyAdminController'

type CategoryDraft = { category: DutyMajorCategory | null; name: string; reason: string }

export function DutyMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const canManage = canManageTeamData(profile)
  const controller = useDutyAdminController(profile, data, setData)
  const [query, setQuery] = useViewState<string>('duties.leader.query', '', (value): value is string => typeof value === 'string')
  const [categoryId, setCategoryId] = useState('')
  const [ownerId, setOwnerId] = useState('')
  const [quick, setQuick] = useState<DutyQuickFilter>('all')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [editor, setEditor] = useState<DutyEditorTarget | null>(null)
  const [categoryDraft, setCategoryDraft] = useState<CategoryDraft | null>(null)
  const [report, setReport] = useState<DutyReportTarget | null>(null)
  const [pendingDelete, setPendingDelete] = useState<PendingAdminDelete | null>(null)
  const [savingCategory, setSavingCategory] = useState(false)
  const returnFocusRef = useRef<HTMLElement | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  const allGroups = useMemo(() => selectDutyGroups(data), [data])
  const allRows = allGroups.flatMap(({ rows }) => rows)
  const allOwners = [...new Map(allRows.flatMap(({ owners }) => owners.map((owner) => [owner.id, owner] as const))).values()]
    .sort((a, b) => a.name.localeCompare(b.name, 'ko-KR'))
  const visibleGroups = filterDutyGroups(allGroups, { query, categoryId, ownerId, quick })
  const visibleCount = visibleGroups.reduce((sum, group) => sum + group.rows.length, 0)
  const filtered = Boolean(query.trim() || categoryId || ownerId || quick !== 'all')
  const latestRow = editor?.row ? allRows.find(({ duty }) => duty.id === editor.row?.duty.id) : undefined
  const deleteItem = pendingDelete?.table === 'duties'
    ? allRows.find(({ duty }) => duty.id === pendingDelete.id)?.duty
    : data.dutyMajorCategories.find(({ id }) => id === pendingDelete?.id)

  const rememberFocus = () => {
    const active = document.activeElement
    returnFocusRef.current = active?.closest('.overflow-menu')?.querySelector('button') ?? (active instanceof HTMLElement ? active : null)
  }
  const reset = () => {
    setQuery('')
    setCategoryId('')
    setOwnerId('')
    setQuick('all')
    setCollapsed(new Set())
  }
  const openEditor = (target: DutyEditorTarget) => {
    rememberFocus()
    setEditor(target)
  }
  const closeEditor = () => {
    const trigger = returnFocusRef.current
    setEditor(null)
    requestAnimationFrame(() => {
      if (!trigger?.isConnected) searchRef.current?.focus()
    })
  }
  const addDuty = (id: string) => openEditor({ row: null, categoryId: id, focus: 'name' })
  const editCategory = (category: DutyMajorCategory | null) => {
    rememberFocus()
    setCategoryDraft({ category, name: category?.name ?? '', reason: '' })
  }
  const openReport = (kind: DutyReportTarget['kind']) => {
    rememberFocus()
    setReport({ kind, all: dutyReportRows(allGroups), filtered: dutyReportRows(visibleGroups) })
  }
  const requestDelete = (table: 'duties' | 'duty_major_categories', item: { id: string; updated_at?: string }) => {
    rememberFocus()
    setPendingDelete({ table, id: item.id, expectedUpdatedAt: item.updated_at ?? null })
  }
  const deleteSelected = async (input: AuditedDeleteInput) => {
    if (!pendingDelete || !deleteItem) return
    const ok = await mutate(async () => {
      if (pendingDelete.table === 'duties') await controller.remove(deleteItem.id, input)
      else await controller.removeCategory(deleteItem.id, input)
    }, quotedWithJosa(deleteItem.name, '을/를') + ' 삭제했어요.')
    if (ok) {
      if (categoryId === deleteItem.id) setCategoryId('')
      setPendingDelete(null)
    }
  }
  const saveCategory = async () => {
    if (!categoryDraft || savingCategory) return
    setSavingCategory(true)
    const { category, reason } = categoryDraft
    let savedName = ''
    let noop = false
    try {
      const ok = await mutate(async () => {
        if (category) {
          savedName = validateMajorCategoryUpdate(data, category.id, categoryDraft.name)
          try {
            const result = await controller.updateCategory(category.id, {
              name: savedName,
              sort_order: category.sort_order ?? null,
              expectedUpdatedAt: category.updated_at ?? null,
              reason,
            })
            noop = result.noop
          } catch (error) {
            if (isMasterStaleError(error)) setCategoryDraft(null)
            throw error
          }
        } else {
          savedName = validateMajorCategoryCreate(data, categoryDraft.name)
          await controller.addCategory({ name: savedName })
        }
      }, () => noop ? '바뀐 내용이 없어요.' : quotedWithJosa(savedName, '을/를') + (category ? ' 수정했어요.' : ' 대분류로 등록했어요.'))
      if (ok) setCategoryDraft(null)
    } finally {
      setSavingCategory(false)
    }
  }

  return (
    <div className="stack duty-master">
      <div className="page-intro master-page-heading">
        <OfficePlace people={[{ profileId: profile.id, name: profile.name }]} place="duties" />
        <div>
          <h1>파트 업무분장</h1>
          <p>대분류 {allGroups.length}개 · 전체 업무 {allRows.length}건</p>
        </div>
        <section className="duty-header-actions" aria-label="업무분장 작업">
          {canManage && <button className="primary" type="button" disabled={!allGroups.length}
            title={!allGroups.length ? '대분류를 먼저 등록해 주세요.' : undefined}
            onClick={() => addDuty(categoryId || allGroups[0]?.category.id || '')}>
            <Plus size={16} aria-hidden="true" /> 업무 등록
          </button>}
          <button className="ghost" type="button" disabled={!allRows.length} onClick={() => openReport('print')}>
            <Printer size={16} aria-hidden="true" /> 인쇄 미리보기
          </button>
          <OverflowMenu label="업무분장 더보기" items={[
            ...(canManage ? [{ label: '대분류 등록', icon: <Plus size={16} />, onSelect: () => editCategory(null) }] : []),
            { label: 'CSV 내려받기', icon: <Download size={16} />, disabled: !allRows.length, onSelect: () => openReport('csv') },
          ]} />
        </section>
      </div>
      <div className="duty-toolbar">
        <div className="duty-filter-fields">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <input ref={searchRef} aria-label="업무분장 검색" type="search" placeholder="업무명·대분류·담당자·비고 검색"
              value={query} onChange={(event) => { setQuery(event.target.value); setCollapsed(new Set()) }} />
          </label>
          <select aria-label="대분류 필터" value={categoryId} onChange={(event) => { setCategoryId(event.target.value); setCollapsed(new Set()) }}>
            <option value="">대분류 전체</option>
            {allGroups.map(({ category }) => <option value={category.id} key={category.id}>{category.name}</option>)}
          </select>
          <select aria-label="담당자 필터" value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setCollapsed(new Set()) }}>
            <option value="">담당자 전체</option>
            {allOwners.map((owner) => <option value={owner.id} key={owner.id}>{owner.name}{owner.inactive ? ' (비활성)' : ''}</option>)}
          </select>
        </div>
        <div className="duty-filter-status">
          <div className="duty-quick-filters" role="group" aria-label="담당 상태 필터">
            {(Object.keys(dutyQuickFilters) as DutyQuickFilter[]).map((filter) => (
              <button key={filter} className="ghost compact" type="button" aria-pressed={quick === filter}
                onClick={() => { setQuick(filter); setCollapsed(new Set()) }}>
                {dutyQuickFilters[filter]} <span>{allRows.filter((row) => matchesDutyQuickFilter(row, filter)).length}</span>
              </button>
            ))}
          </div>
          <div className="inline-actions">
            <span role="status">{filtered ? '검색 결과 ' + visibleCount + '건 / 전체 ' + allRows.length + '건' : '전체 ' + visibleCount + '건'}</span>
            {filtered && <button className="ghost compact" type="button" onClick={reset}>초기화</button>}
          </div>
        </div>
      </div>
      <DutyTable groups={visibleGroups} filtered={filtered} reset={reset} collapsed={collapsed}
        toggleGroup={(id) => setCollapsed((current) => {
          const next = new Set(current)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })}
        actions={canManage ? {
          onAdd: addDuty,
          onAddCategory: () => editCategory(null),
          onEditCategory: editCategory,
          onDeleteCategory: (category) => requestDelete('duty_major_categories', category),
          onEdit: (row, focus) => openEditor({ row, focus, categoryId: row.duty.major_category_id }),
          onDelete: ({ duty }) => requestDelete('duties', duty),
        } : undefined}
      />

      {canManage && editor && <DutyEditor key={editor.row ? editor.row.duty.id + ':' + editor.row.duty.updated_at : 'new'}
        target={editor} latestRow={latestRow} groups={allGroups} profiles={data.profiles} mutate={mutate} onSave={controller.save}
        onLoadLatest={(row) => setEditor({ row, focus: editor.focus, categoryId: row.duty.major_category_id })}
        onClose={closeEditor} returnFocusRef={returnFocusRef} />}
      {canManage && categoryDraft && <Modal open title={categoryDraft.category ? '대분류 이름 수정' : '대분류 등록'}
        eyebrow="업무분장" icon={<ClipboardList size={18} />} returnFocusRef={returnFocusRef}
        onClose={() => { if (!savingCategory) setCategoryDraft(null) }}
        dirty={!savingCategory && (categoryDraft.name.trim() !== (categoryDraft.category?.name ?? '') || Boolean(categoryDraft.reason.trim()))}>
        <FormGrid fields={<>
          <label className="wide">대분류명
            <input value={categoryDraft.name} required onChange={(event) => setCategoryDraft({ ...categoryDraft, name: event.target.value })} />
          </label>
          {categoryDraft.category && <label className="wide">변경 사유
            <textarea value={categoryDraft.reason} maxLength={500} required onChange={(event) => setCategoryDraft({ ...categoryDraft, reason: event.target.value })} />
            <small>감사 이력에 남아요.</small>
          </label>}
        </>} submitting={savingCategory}
          disabled={!categoryDraft.name.trim() || Boolean(categoryDraft.category && (!categoryDraft.reason.trim() || categoryDraft.name.trim() === categoryDraft.category.name))}
          disabledReason="대분류명과 필요한 변경 사유를 입력해 주세요."
          onSubmit={() => void saveCategory()} onCancel={() => { if (!savingCategory) setCategoryDraft(null) }}
          submitLabel={categoryDraft.category ? '저장하기' : '대분류 등록하기'}
        />
      </Modal>}
      {canManage && pendingDelete && deleteItem && <Modal open title="삭제 확인"
        onClose={() => setPendingDelete(null)} returnFocusRef={returnFocusRef}>
        <DeleteConfirmAction table={pendingDelete.table} id={deleteItem.id} expectedUpdatedAt={deleteItem.updated_at}
          label={pendingDelete.table === 'duties' ? '업무' : '대분류'} itemName={deleteItem.name}
          warning={pendingDelete.table === 'duties' ? masterDeleteWarnings.duty : masterDeleteWarnings.dutyMajorCategory}
          pendingDelete={pendingDelete} setPendingDelete={setPendingDelete} onConfirm={(input) => void deleteSelected(input)} hideTrigger />
      </Modal>}
      {report && <DutyReportDialog target={report} onClose={() => setReport(null)} returnFocusRef={returnFocusRef} />}
    </div>
  )
}
