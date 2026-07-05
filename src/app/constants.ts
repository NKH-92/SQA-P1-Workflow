import type { AdminDeleteTable } from './types'
import type { AppData } from '../types'

export const PASSWORD_MIN_LENGTH = 8
export const TEMP_PASSWORD_MIN_LENGTH = 4

export const emptyData: AppData = {
  profiles: [],
  allowedUsers: [],
  products: [],
  duties: [],
  productAssignments: [],
  dutyAssignments: [],
  reviewRequests: [],
  projects: [],
  projectAssignments: [],
  profileNotes: [],
  activityLogs: [],
}

export const deleteWarnings: Record<AdminDeleteTable, string> = {
  allowed_users:
    '초대 목록에서만 제거됩니다. 이미 가입한 계정은 Supabase 대시보드에서 사용자를 삭제해야 접근이 차단됩니다. 비활성화로 로그인만 막으려면 "비활성" 토글을 사용하세요.',
  products: '제품과 연결된 담당제품 배정이 함께 삭제될 수 있습니다.',
  duties: '업무와 연결된 담당업무 배정이 함께 삭제될 수 있습니다.',
  product_assignments: '선택한 담당제품 배정만 삭제합니다.',
  duty_assignments: '선택한 담당업무 배정만 삭제합니다.',
}
