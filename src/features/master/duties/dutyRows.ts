import { PRODUCT_DUTY_LABEL } from '../../../data'
import type { AppData, Duty, DutyMajorCategory } from '../../../types'
import { selectDutyTableGroups } from '../master.selectors'

export type DutyOwner = { id: string; name: string; inactive: boolean }
export type DutyRow = { duty: Duty; owners: DutyOwner[] }
export type DutyGroup = { category: DutyMajorCategory; rows: DutyRow[]; total: number }
export type DutyQuickFilter = 'all' | 'unassigned' | 'product' | 'inactive'
export const dutyQuickFilters: Record<DutyQuickFilter, string> = {
  all: '전체',
  unassigned: '미지정',
  product: PRODUCT_DUTY_LABEL,
  inactive: '비활성 담당 포함',
}

export function selectDutyGroups(data: AppData): DutyGroup[] {
  const profiles = new Map(data.profiles.map((profile) => [profile.id, profile]))
  const ownersByDuty = new Map<string, DutyOwner[]>()
  for (const assignment of data.dutyAssignments) {
    const profile = profiles.get(assignment.user_id)
    const owners = ownersByDuty.get(assignment.duty_id) ?? []
    owners.push({
      id: assignment.user_id,
      name: profile?.name ?? assignment.profiles?.name ?? '알 수 없는 사용자',
      inactive: profile?.is_active === false,
    })
    ownersByDuty.set(assignment.duty_id, owners)
  }
  return selectDutyTableGroups(data).map(({ category, duties }) => ({
    category,
    total: duties.length,
    rows: duties.map((duty) => ({
      duty,
      owners: (ownersByDuty.get(duty.id) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'ko-KR')),
    })),
  }))
}

export function matchesDutyQuickFilter(row: DutyRow, filter: DutyQuickFilter) {
  if (filter === 'unassigned') return row.owners.length === 0 && !row.duty.assignee_label
  if (filter === 'product') return row.duty.assignee_label === PRODUCT_DUTY_LABEL
  if (filter === 'inactive') return row.owners.some((owner) => owner.inactive)
  return true
}

export function filterDutyGroups(
  groups: DutyGroup[],
  { query, categoryId, ownerId, quick }: { query: string; categoryId: string; ownerId: string; quick: DutyQuickFilter },
) {
  const term = query.trim().toLocaleLowerCase('ko-KR')
  return groups.flatMap((group) => {
    if (categoryId && group.category.id !== categoryId) return []
    const categoryMatch = group.category.name.toLocaleLowerCase('ko-KR').includes(term)
    const rows = group.rows.filter((row) => (
      matchesDutyQuickFilter(row, quick)
      && (!ownerId || row.owners.some((owner) => owner.id === ownerId))
      && (categoryMatch || [row.duty.name, row.duty.notes, row.duty.assignee_label, ...row.owners.map((owner) => owner.name)]
        .some((value) => value?.toLocaleLowerCase('ko-KR').includes(term)))
    ))
    const showEmptyCategory = group.total === 0 && categoryMatch && !ownerId && quick === 'all'
    return rows.length || showEmptyCategory ? [{ ...group, rows }] : []
  })
}

export function dutyAssigneeNames(row: DutyRow) {
  const names = row.owners.map((owner) => owner.inactive ? owner.name + ' (비활성)' : owner.name)
  if (row.duty.assignee_label) names.push(row.duty.assignee_label)
  return names.length ? names : ['미지정']
}

export function dutyReportRows(groups: DutyGroup[]) {
  return groups.flatMap(({ category, rows }) => rows.map((row) => ({
    대분류: category.name,
    업무명: row.duty.name,
    담당자: dutyAssigneeNames(row).join(', '),
    비고: row.duty.notes ?? '',
  })))
}

export type DutyReportRow = ReturnType<typeof dutyReportRows>[number]
