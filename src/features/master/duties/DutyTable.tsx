import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Save } from 'lucide-react'
import { deleteWarnings } from '../../../app/constants'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import type { AppData, Duty, DutyMajorCategory } from '../../../types'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'

export type DutyTableGroup = {
  category: DutyMajorCategory
  duties: Duty[]
}

export type DutyEdit = { major_category_id: string; name: string; expectedUpdatedAt: string | null }
export type DutyMajorCategoryEdit = { name: string; expectedUpdatedAt: string | null }

export function DutyTable({
  data,
  dutyTableGroups,
  dutyEdits,
  setDutyEdits,
  majorCategoryEdits,
  setMajorCategoryEdits,
  pendingDelete,
  setPendingDelete,
  onSaveDuty,
  onSaveMajorCategory,
  onDeleteDuty,
  onDeleteMajorCategory,
}: {
  data: AppData
  dutyTableGroups: DutyTableGroup[]
  dutyEdits: Record<string, DutyEdit>
  setDutyEdits: Dispatch<SetStateAction<Record<string, DutyEdit>>>
  majorCategoryEdits: Record<string, DutyMajorCategoryEdit>
  setMajorCategoryEdits: Dispatch<SetStateAction<Record<string, DutyMajorCategoryEdit>>>
  pendingDelete: PendingAdminDelete | null
  setPendingDelete: (value: PendingAdminDelete | null) => void
  onSaveDuty: (dutyId: string) => void
  onSaveMajorCategory: (majorCategoryId: string) => void
  onDeleteDuty: (dutyId: string, input: AuditedDeleteInput) => void
  onDeleteMajorCategory: (majorCategoryId: string, input: AuditedDeleteInput) => void
}) {
  const renderMajorCategoryCell = (category: DutyMajorCategory, categoryDutyCount: number) => {
    const majorEdit = majorCategoryEdits[category.id]
    if (majorEdit) {
      return (
        <div className="table-inline-form">
          <input
            value={majorEdit.name}
            onChange={(event) =>
              setMajorCategoryEdits({
                ...majorCategoryEdits,
                [category.id]: { ...majorEdit, name: event.target.value },
              })
            }
          />
          <div className="inline-actions">
            <button
              className="primary compact"
              disabled={!majorEdit.name.trim()}
              onClick={() => onSaveMajorCategory(category.id)}
              type="button"
            >
              <Save size={16} />
            </button>
            <button
              className="ghost compact"
              onClick={() =>
                setMajorCategoryEdits((current) => {
                  const next = { ...current }
                  delete next[category.id]
                  return next
                })
              }
              type="button"
            >
              취소
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="major-category-cell-content">
        <strong>{category.name}</strong>
        <div className="group-actions">
          <button
            className="ghost compact"
            onClick={() =>
              setMajorCategoryEdits({
                ...majorCategoryEdits,
                [category.id]: { name: category.name, expectedUpdatedAt: category.updated_at ?? null },
              })
            }
            title="대분류 수정"
            type="button"
          >
            <Pencil size={16} />
          </button>
          {categoryDutyCount === 0 && (
            <DeleteConfirmAction
              table="duty_major_categories"
              id={category.id}
              expectedUpdatedAt={category.updated_at}
              label="대분류"
              itemName={category.name}
              warning={deleteWarnings.duty_major_categories}
              pendingDelete={pendingDelete}
              setPendingDelete={setPendingDelete}
              onConfirm={(input) => onDeleteMajorCategory(category.id, input)}
            />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="duty-master-table-wrap">
      <table className="duty-master-table">
        <thead>
          <tr>
            <th scope="col">대분류</th>
            <th scope="col">업무</th>
            <th scope="col">담당</th>
            <th scope="col">비고</th>
            <th scope="col">관리</th>
          </tr>
        </thead>
        <tbody>
          {dutyTableGroups.map(({ category, duties: categoryDuties }) => {
            const categoryDutyCount = data.duties.filter((duty) => duty.major_category_id === category.id).length
            if (categoryDuties.length === 0) {
              return (
                <tr key={category.id}>
                  <td className="major-category-cell">{renderMajorCategoryCell(category, categoryDutyCount)}</td>
                  <td colSpan={4} className="duty-empty-cell">
                    등록된 업무 없음
                  </td>
                </tr>
              )
            }

            return categoryDuties.map((duty, index) => {
              const assignments = data.dutyAssignments.filter((assignment) => assignment.duty_id === duty.id)
              const edit = dutyEdits[duty.id]
              const isUnassigned = assignments.length === 0 && !duty.assignee_label
              return (
                <tr className={isUnassigned ? 'unassigned-row' : undefined} key={duty.id}>
                  {index === 0 && (
                    <td className="major-category-cell" rowSpan={categoryDuties.length}>
                      {renderMajorCategoryCell(category, categoryDutyCount)}
                    </td>
                  )}
                  <td>
                    {edit ? (
                      <div className="table-inline-form">
                        <select
                          value={edit.major_category_id}
                          onChange={(event) =>
                            setDutyEdits({ ...dutyEdits, [duty.id]: { ...edit, major_category_id: event.target.value } })
                          }
                        >
                          {data.dutyMajorCategories.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <input
                          value={edit.name}
                          onChange={(event) => setDutyEdits({ ...dutyEdits, [duty.id]: { ...edit, name: event.target.value } })}
                        />
                        <div className="inline-actions">
                          <button
                            className="primary compact"
                            disabled={!edit.name.trim()}
                            onClick={() => onSaveDuty(duty.id)}
                            type="button"
                          >
                            <Save size={16} />
                          </button>
                          <button
                            className="ghost compact"
                            onClick={() =>
                              setDutyEdits((current) => {
                                const next = { ...current }
                                delete next[duty.id]
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
                      duty.name
                    )}
                  </td>
                  <td>
                    <div className="pill-row compact">
                      {assignments.map((assignment) => (
                        <span
                          className={data.profiles.find((profile) => profile.id === assignment.user_id)?.is_active === false
                            ? 'pill-warn'
                            : undefined}
                          key={assignment.id}
                          title={data.profiles.find((profile) => profile.id === assignment.user_id)?.is_active === false
                            ? '담당자 비활성 · 재배정 필요'
                            : undefined}
                        >
                          {assignment.profiles?.name ?? assignment.user_id}
                          {data.profiles.find((profile) => profile.id === assignment.user_id)?.is_active === false
                            ? ' · 비활성'
                            : ''}
                        </span>
                      ))}
                      {assignments.length === 0 && duty.assignee_label && <span>{duty.assignee_label}</span>}
                      {isUnassigned && <span className="pill-warn">배정 필요</span>}
                    </div>
                  </td>
                  <td>{duty.notes || '-'}</td>
                  <td>
                    {!edit && (
                      <div className="group-actions">
                        <button
                          className="ghost compact"
                          onClick={() =>
                            setDutyEdits({
                              ...dutyEdits,
                              [duty.id]: {
                                name: duty.name,
                                major_category_id: duty.major_category_id,
                                expectedUpdatedAt: duty.updated_at ?? null,
                              },
                            })
                          }
                          title="업무 수정"
                          type="button"
                        >
                          <Pencil size={16} />
                        </button>
                        <DeleteConfirmAction
                          table="duties"
                          id={duty.id}
                          expectedUpdatedAt={duty.updated_at}
                          label="업무"
                          itemName={duty.name}
                          pendingDelete={pendingDelete}
                          setPendingDelete={setPendingDelete}
                          onConfirm={(input) => onDeleteDuty(duty.id, input)}
                        />
                      </div>
                    )}
                  </td>
                </tr>
              )
            })
          })}
        </tbody>
      </table>
      {dutyTableGroups.length === 0 && <p className="empty">등록된 대분류가 없습니다. 먼저 대분류를 등록해 주세요.</p>}
    </div>
  )
}
