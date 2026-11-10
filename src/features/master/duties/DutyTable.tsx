import { ChevronDown, ChevronRight, ClipboardList, Pencil, Plus, Trash2 } from 'lucide-react'
import { EmptyState, OverflowMenu } from '../../../components/ui'
import type { DutyMajorCategory } from '../../../types'
import type { DutyEditorTarget } from './DutyEditor'
import { dutyAssigneeNames, matchesDutyQuickFilter, type DutyGroup, type DutyRow } from './dutyRows'

type DutyTableActions = {
  onAdd: (categoryId: string) => void
  onAddCategory: () => void
  onEditCategory: (category: DutyMajorCategory) => void
  onDeleteCategory: (category: DutyMajorCategory) => void
  onEdit: (row: DutyRow, focus: DutyEditorTarget['focus']) => void
  onDelete: (row: DutyRow) => void
}

export function DutyTable({ groups, collapsed, toggleGroup, actions, filtered, reset }: {
  groups: DutyGroup[]
  collapsed: ReadonlySet<string>
  toggleGroup: (id: string) => void
  actions?: DutyTableActions
  filtered: boolean
  reset: () => void
}) {
  if (!groups.length) {
    return <EmptyState
      icon={<ClipboardList size={22} />}
      title={filtered ? '조건에 맞는 업무가 없어요' : '아직 대분류가 없어요'}
      description={filtered ? '검색어나 필터를 바꿔 보세요.' : actions ? '대분류를 먼저 등록하면 업무를 추가할 수 있어요.' : undefined}
      action={filtered
        ? <button className="ghost compact" type="button" onClick={reset}>검색·필터 초기화</button>
        : actions && <button className="primary compact" type="button" onClick={actions.onAddCategory}>대분류 등록</button>}
    />
  }
  return (
    <table className="duty-master-table" aria-label="파트 업무분장" role="table">
      <thead role="rowgroup">
        <tr role="row">
          <th role="columnheader" scope="col">업무명</th>
          <th role="columnheader" scope="col">담당자</th>
          <th role="columnheader" scope="col">비고</th>
          {actions && <th className="duty-table-manage" role="columnheader" scope="col">관리</th>}
        </tr>
      </thead>
      {groups.map(({ category, rows, total }) => {
        const isCollapsed = collapsed.has(category.id)
        const Arrow = isCollapsed ? ChevronRight : ChevronDown
        return <tbody key={category.id} role="rowgroup">
          <tr className="duty-category-row" role="row">
            <th role="rowheader" colSpan={actions ? 4 : 3} scope="rowgroup">
              <div className="duty-group-heading">
                <button className="ghost compact duty-group-toggle" type="button" aria-expanded={!isCollapsed} onClick={() => toggleGroup(category.id)}>
                  <Arrow size={16} aria-hidden="true" />
                  <strong>{category.name}</strong>
                  <small>{rows.length === total ? total : rows.length + '/' + total}건</small>
                </button>
                {actions && <OverflowMenu label={category.name + ' 대분류 관리'} items={[
                  { label: '업무 등록', icon: <Plus size={16} />, onSelect: () => actions.onAdd(category.id) },
                  { label: '대분류 이름 수정', icon: <Pencil size={16} />, onSelect: () => actions.onEditCategory(category) },
                  ...(total === 0 ? [{ label: '대분류 삭제', icon: <Trash2 size={16} />, danger: true, onSelect: () => actions.onDeleteCategory(category) }] : []),
                ]} />}
              </div>
            </th>
          </tr>
          {!isCollapsed && rows.length === 0 && <tr className="duty-category-empty" role="row">
            <td colSpan={actions ? 4 : 3} role="cell">
              아직 업무가 없어요
              {actions && <button type="button" className="ghost compact" aria-label={category.name + '에 업무 등록'} onClick={() => actions.onAdd(category.id)}>
                <Plus size={14} aria-hidden="true" /> 업무 등록
              </button>}
            </td>
          </tr>}
          {!isCollapsed && rows.map((row) => {
            const { duty } = row
            const note = duty.notes ?? ''
            const longNote = note.length > 120 || note.split('\n').length > 3
            const assignees = <span className="pill-row compact">
              {dutyAssigneeNames(row).map((name, index) => <span key={index}
                className={matchesDutyQuickFilter(row, 'unassigned') || row.owners[index]?.inactive ? 'pill-warn' : undefined}>{name}</span>)}
            </span>
            return <tr className="duty-data-row" key={duty.id} role="row">
              <th scope="row" role="rowheader">{duty.name}</th>
              <td role="cell">
                <span className="duty-mobile-label" aria-hidden="true">담당자</span>
                {actions
                  ? <button className="duty-cell-action" type="button" aria-label={duty.name + ' 담당자 수정'}
                      onClick={() => actions.onEdit(row, 'assignment')}>{assignees}</button>
                  : assignees}
              </td>
              <td role="cell">
                <span className="duty-mobile-label" aria-hidden="true">비고</span>
                {actions
                  ? <button className="duty-cell-action duty-note" type="button" aria-label={duty.name + ' 비고 수정'}
                      onClick={() => actions.onEdit(row, 'notes')}>
                      <span className={note ? 'duty-note-preview' : 'duty-placeholder'}>{note || '비고 추가'}</span>
                    </button>
                  : longNote
                    ? <details className="duty-note"><summary>비고 펼치기</summary>{note}</details>
                    : <span className="duty-note">{note || '—'}</span>}
              </td>
              {actions && <td className="duty-table-manage" role="cell">
                <div className="group-actions">
                  <button className="ghost compact" type="button" aria-label={duty.name + ' 업무 수정'} onClick={() => actions.onEdit(row, 'name')}>
                    <Pencil size={14} aria-hidden="true" /> 수정
                  </button>
                  <OverflowMenu label={duty.name + ' 더보기'} items={[
                    { label: '업무 삭제', icon: <Trash2 size={16} />, danger: true, onSelect: () => actions.onDelete(row) },
                  ]} />
                </div>
              </td>}
            </tr>
          })}
        </tbody>
      })}
    </table>
  )
}
