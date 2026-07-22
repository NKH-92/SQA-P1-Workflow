import type { AdminDeleteTable } from './types'
import type { AppData } from '../types'
import { createEmptyAppData } from '../data/appData'

export const PASSWORD_MIN_LENGTH = 8

/** @deprecated 새 상태에는 createEmptyAppData()를 사용한다. */
export const emptyData: AppData = createEmptyAppData()
export { createEmptyAppData }

export const deleteWarnings: Record<AdminDeleteTable, string> = {
  allowed_users:
    '초대 목록에서만 제거됩니다. 이미 가입한 계정은 Supabase 대시보드에서 사용자를 삭제해야 접근이 차단됩니다. 비활성화로 로그인만 막으려면 "비활성" 토글을 사용하세요.',
  products: '담당제품 배정은 함께 삭제됩니다. 변경 적용 이력이 있는 제품은 이력 보호를 위해 삭제할 수 없습니다.',
  duties: '업무와 연결된 담당업무 배정이 함께 삭제될 수 있습니다.',
  duty_major_categories: '대분류에 등록된 업무가 있으면 삭제할 수 없습니다.',
  projects: '프로젝트와 연결된 담당자 배정이 함께 삭제됩니다.',
}
