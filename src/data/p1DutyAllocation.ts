export type P1DutyAllocationRow = {
  majorCategory: string
  dutyName: string
  assigneeName: string
  notes: string
}

export const P1_DUTY_ASSIGNEE_LABELS = new Set(['제품 담당자', '순차 배정'])

export function isP1DirectDutyAssignee(name: string) {
  const trimmed = name.trim()
  return trimmed.length > 0 && !P1_DUTY_ASSIGNEE_LABELS.has(trimmed)
}

export function resolveP1DutyAssigneeLabel(assigneeName: string) {
  const trimmed = assigneeName.trim()
  return isP1DirectDutyAssignee(trimmed) ? null : trimmed || null
}

// Product-external duty allocation (제품 외 업무).
export const p1DutyAllocationRows = [
  { majorCategory: '밸리데이션', dutyName: 'PV', assigneeName: '제품 담당자', notes: '일정관리 - 구하영' },
  { majorCategory: '밸리데이션', dutyName: 'CV', assigneeName: '순차 배정', notes: '일정관리 - 구하영' },
  { majorCategory: '밸리데이션', dutyName: 'CHV', assigneeName: '순차 배정', notes: '일정관리 - 구하영' },
  { majorCategory: '밸리데이션', dutyName: '포장', assigneeName: '전예지', notes: '개정검토 - 전예지' },
  { majorCategory: '적격성평가', dutyName: '적격성평가 Main', assigneeName: '편승훈', notes: 'Main' },
  { majorCategory: '적격성평가', dutyName: '적격성평가 Sub', assigneeName: '전예지', notes: 'Sub' },
  { majorCategory: '일탈', dutyName: '실험실 Main', assigneeName: '남광현', notes: 'Main' },
  { majorCategory: '일탈', dutyName: '실험실 Sub', assigneeName: '김초은', notes: 'Sub' },
  { majorCategory: '일탈', dutyName: '생산3부', assigneeName: '이건우', notes: 'OOS 생산조사 sub' },
  { majorCategory: 'OOS / OOT', dutyName: '이화학 OOS / OOT', assigneeName: '편승훈', notes: 'OOS 생산조사 Main' },
  { majorCategory: '문서관리', dutyName: 'SMF', assigneeName: '김초은', notes: 'N/A' },
  { majorCategory: '문서관리', dutyName: 'CV Matrix', assigneeName: '구하영', notes: 'N/A' },
  { majorCategory: '문서관리', dutyName: '밸리데이션 마스터파일', assigneeName: '구하영', notes: 'N/A' },
  { majorCategory: '문서관리', dutyName: 'CCS', assigneeName: '남광현', notes: 'N/A' },
  { majorCategory: '문서관리', dutyName: '위수탁 계약서', assigneeName: '구하영', notes: 'N/A' },
  { majorCategory: '문서관리', dutyName: 'GMP 서명대장', assigneeName: '박지수', notes: 'N/A' },
  { majorCategory: '발행', dutyName: '제조 / 포장 기록서', assigneeName: '제품 담당자', notes: 'N/A' },
  { majorCategory: '발행', dutyName: '무균 실험일지', assigneeName: '박지수', notes: 'N/A' },
  { majorCategory: '발행', dutyName: '비무균 실험일지', assigneeName: '박지수', notes: 'N/A' },
  { majorCategory: '발행', dutyName: 'IPC 실험일지', assigneeName: '박지수', notes: 'N/A' },
  { majorCategory: '발행', dutyName: '환경모니터링 실험일지', assigneeName: '정영주', notes: 'N/A' },
  { majorCategory: '기타업무', dutyName: '임상의약품 관리', assigneeName: '김지윤', notes: 'N/A' },
  { majorCategory: '기타업무', dutyName: '교정 지원', assigneeName: '김지윤', notes: 'N/A' },
  { majorCategory: '기타업무', dutyName: '보관검체', assigneeName: '정영주', notes: 'N/A' },
  { majorCategory: '기타업무', dutyName: '스캔 및 회수', assigneeName: '조소연', notes: 'N/A' },
] as const satisfies readonly P1DutyAllocationRow[]

export function listP1DutyMajorCategories(rows: readonly P1DutyAllocationRow[] = p1DutyAllocationRows) {
  const categories: string[] = []
  for (const row of rows) {
    if (!categories.includes(row.majorCategory)) categories.push(row.majorCategory)
  }
  return categories
}
