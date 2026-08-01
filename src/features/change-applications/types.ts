import type {
  AppData,
  ChangeActionKind,
  ChangeApplicationSource,
  ProductChangeTaskStatus,
} from '../../types'

export type ChangeApplicationFeatureData = Pick<
  AppData,
  | 'changeApplications'
  | 'changeApplicationSummaries'
  | 'changeActionItems'
  | 'productChangeTasks'
  | 'changeProductScope'
  | 'changeAssigneeOptions'
  | 'products'
  | 'productAssignments'
  | 'profiles'
>

export type { ChangeApplicationInput, ChangeTaskDraft } from '../../data/contracts'

export type ProductTaskAction =
  | { kind: 'complete'; completionNote: string; proxyReason: string }
  | { kind: 'not_applicable'; reason: string; proxyReason: string }
  | { kind: 'reopen'; reason: string }
  | { kind: 'cancel'; reason: string }

export const changeApplicationSourceLabels: Record<ChangeApplicationSource, string> = {
  official: '공식 변경관리',
  internal: '내부 조치사항',
  other: '기타',
}

export const changeActionKindLabels: Record<ChangeActionKind, string> = {
  product_standard: '제품표준서',
  other: '기타',
}

export const productChangeTaskStatusLabels: Record<ProductChangeTaskStatus, string> = {
  pending: '미적용',
  completed: '적용 완료',
  not_applicable: '해당 없음',
  cancelled: '취소',
}
