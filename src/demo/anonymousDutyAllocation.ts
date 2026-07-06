export type DemoDutyAllocationRow = {
  majorCategory: string
  dutyName: string
  assigneeName: string
  notes: string
}

export const DEMO_DUTY_ASSIGNEE_LABELS = new Set(['제품 담당자', '순차 배정'])

export function isDirectDutyAssignee(name: string) {
  const trimmed = name.trim()
  return trimmed.length > 0 && !DEMO_DUTY_ASSIGNEE_LABELS.has(trimmed)
}

export function resolveDutyAssigneeLabel(assigneeName: string) {
  const trimmed = assigneeName.trim()
  return isDirectDutyAssignee(trimmed) ? null : trimmed || null
}

export const demoDutyAllocationRows = [
  { majorCategory: '품질관리', dutyName: '밸리데이션', assigneeName: '제품 담당자', notes: '데모 일정관리' },
  { majorCategory: '품질관리', dutyName: '적격성평가', assigneeName: '파트원 A', notes: 'Main' },
  { majorCategory: '문서관리', dutyName: '문서 등록', assigneeName: '파트원 B', notes: 'N/A' },
  { majorCategory: '문서관리', dutyName: '기록서 발행', assigneeName: '순차 배정', notes: 'N/A' },
  { majorCategory: '기타업무', dutyName: '교정 지원', assigneeName: '파트원 C', notes: 'N/A' },
] as const satisfies readonly DemoDutyAllocationRow[]

export function listDutyMajorCategories(rows: readonly DemoDutyAllocationRow[] = demoDutyAllocationRows) {
  const categories: string[] = []
  for (const row of rows) {
    if (!categories.includes(row.majorCategory)) categories.push(row.majorCategory)
  }
  return categories
}
