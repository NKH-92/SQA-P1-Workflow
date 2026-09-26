import type { Dispatch, SetStateAction } from 'react'
import { ClipboardList, Pencil, Plus, Save, UserRoundCog } from 'lucide-react'
import { EmptyState } from '../../../components/ui'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import type { AppData, Duty, DutyMajorCategory } from '../../../types'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'
import { masterDeleteWarnings } from '../shared/deleteCopy'

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
  onReassignDuty,
  onRegisterCategory,
  onRegisterDuty,
  searchActive = false,
  onClearSearch,
  readOnly,
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
  /** 업무 행의 ‘담당자 변경’(여러 명 선택·빼기·옮기기) */
  onReassignDuty?: (dutyId: string) => void
  onRegisterCategory?: () => void
  onRegisterDuty?: (majorCategoryId: string) => void
  searchActive?: boolean
  onClearSearch?: () => void
  readOnly: boolean
}) {
  const isInactive = (userId: string) => data.profiles.find((profile) => profile.id === userId)?.is_active === false

  const renderMajorCategoryCell = (category: DutyMajorCategory, categoryDutyCount: number) => {
    const majorEdit = majorCategoryEdits[category.id]
    if (majorEdit && !readOnly) {
      return (
        <div className="table-inline-form">
          <input
            aria-label={`${category.name} 대분류 이름`}
            autoFocus
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
              닫기
            </button>
            <button
              aria-label={`${category.name} 대분류 저장`}
              className="primary compact"
              disabled={!majorEdit.name.trim()}
              onClick={() => onSaveMajorCategory(category.id)}
              title="대분류 저장"
              type="button"
            >
              <Save aria-hidden="true" size={16} />
            </button>
          </div>
        </div>
      )
    }

    return (
      <div className="major-category-cell-content">
        <strong>{category.name}</strong>
        {!readOnly && <div className="group-actions">
          <button
            aria-label={`${category.name} 대분류 수정`}
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
            <Pencil aria-hidden="true" size={16} />
          </button>
          {categoryDutyCount === 0 && (
            <DeleteConfirmAction
              table="duty_major_categories"
              id={category.id}
              expectedUpdatedAt={category.updated_at}
              label="대분류"
              itemName={category.name}
              warning={masterDeleteWarnings.dutyMajorCategory}
              pendingDelete={pendingDelete}
              setPendingDelete={setPendingDelete}
              onConfirm={(input) => onDeleteMajorCategory(category.id, input)}
            />
          )}
        </div>}
      </div>
    )
  }

  if (dutyTableGroups.length === 0) {
    return (
      <div className="duty-master-table-wrap">
        <EmptyState
          icon={<ClipboardList size={22} />}
          title={searchActive ? '조건에 맞는 업무가 없어요' : '아직 대분류가 없어요'}
          description={searchActive ? '다른 검색어로 찾아보세요.' : readOnly ? undefined : '대분류를 먼저 등록하면 업무를 추가하고 담당자를 배정할 수 있어요.'}
          action={searchActive
            ? onClearSearch && <button className="ghost compact" onClick={onClearSearch} type="button">검색어 지우기</button>
            : !readOnly && onRegisterCategory
              ? <button className="primary compact" onClick={onRegisterCategory} type="button"><Plus size={14} />대분류 등록</button>
              : undefined}
        />
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
            <th scope="col">담당자</th>
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
                    <span>아직 업무가 없어요</span>
                    {!readOnly && onRegisterDuty && (
                      <button aria-label={`${category.name}에 업무 등록`} className="ghost compact" onClick={() => onRegisterDuty(category.id)} type="button">
                        <Plus aria-hidden="true" size={14} />
                        업무 등록
                      </button>
                    )}
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
                    {edit && !readOnly ? (
                      <div className="table-inline-form">
                        <select
                          aria-label={`${duty.name} 업무 대분류`}
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
                          aria-label={`${duty.name} 업무 이름`}
                          autoFocus
                          value={edit.name}
                          onChange={(event) => setDutyEdits({ ...dutyEdits, [duty.id]: { ...edit, name: event.target.value } })}
                        />
                        <div className="inline-actions">
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
                            닫기
                          </button>
                          <button
                            aria-label={`${duty.name} 업무 저장`}
                            className="primary compact"
                            disabled={!edit.name.trim()}
                            onClick={() => onSaveDuty(duty.id)}
                            title="업무 저장"
                            type="button"
                          >
                            <Save aria-hidden="true" size={16} />
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
                          className={isInactive(assignment.user_id) ? 'pill-warn' : undefined}
                          key={assignment.id}
                          title={isInactive(assignment.user_id) ? '비활성 계정이에요. 담당자 변경에서 다른 담당자를 골라 주세요.' : undefined}
                        >
                          {assignment.profiles?.name
                            ?? data.profiles.find((profile) => profile.id === assignment.user_id)?.name
                            ?? '알 수 없는 사용자'}
                          {isInactive(assignment.user_id) ? ' · 비활성' : ''}
                        </span>
                      ))}
                      {assignments.length === 0 && duty.assignee_label && <span>{duty.assignee_label}</span>}
                      {isUnassigned && <span className="pill-warn">담당자 없음</span>}
                    </div>
                  </td>
                  <td>{duty.notes || '-'}</td>
                  <td>
                    {!edit && !readOnly && (
                      <div className="group-actions">
                        {onReassignDuty && (
                          <button
                            aria-label={`${duty.name} 담당자 변경`}
                            className={isUnassigned ? 'primary compact' : 'ghost compact'}
                            onClick={() => onReassignDuty(duty.id)}
                            type="button"
                          >
                            <UserRoundCog aria-hidden="true" size={15} />
                            담당자 변경
                          </button>
                        )}
                        <button
                          aria-label={`${duty.name} 업무 수정`}
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
                          <Pencil aria-hidden="true" size={16} />
                        </button>
                        <DeleteConfirmAction
                          table="duties"
                          id={duty.id}
                          expectedUpdatedAt={duty.updated_at}
                          label="업무"
                          itemName={duty.name}
                          warning={masterDeleteWarnings.duty}
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
    </div>
  )
}
