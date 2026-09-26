import { UserFacingError } from '../../lib/errors'
import { withJosa } from '../../lib/korean'
import type { AppData } from '../../types'
import type { ChangeApplicationInput, ChangeTaskDraft } from '../contracts'
import { selectProductChangeTaskContexts } from '../selectors/changeTaskContexts'

export const CHANGE_APPLICATION_STALE_MESSAGE =
  '다른 사람이 먼저 공통변경을 수정했어요. 새로고침한 뒤 다시 시도해 주세요.'

export const CHANGE_CONTENT_LOCKED_MESSAGE =
  '처리를 시작한 제품이 있어서 변경 내용을 수정할 수 없어요.'

function tooLongMessage(label: string, maxLength: number) {
  return `${withJosa(label, '은/는')} ${maxLength.toLocaleString('ko-KR')}자 이하로 입력해 주세요.`
}

/** 라벨 뒤 조사는 받침에 맞춰 붙인다(‘완료 메모를’, ‘해당 없음 사유를’). */
function required(value: string, label: string, maxLength: number) {
  const normalized = value.trim()
  if (!normalized) throw new UserFacingError(`${withJosa(label, '을/를')} 입력해 주세요.`)
  if (normalized.length > maxLength) throw new UserFacingError(tooLongMessage(label, maxLength))
  return normalized
}

function optional(value: string | null, maxLength: number, label: string) {
  const normalized = value?.trim() || null
  if (normalized && normalized.length > maxLength) {
    throw new UserFacingError(tooLongMessage(label, maxLength))
  }
  return normalized
}

function normalizeTasks(data: AppData, tasks: ChangeTaskDraft[]): ChangeTaskDraft[] {
  if (tasks.length === 0) throw new UserFacingError('적용 제품을 한 개 이상 선택해 주세요.')
  const seen = new Set<string>()
  const productIds = new Set(data.changeProductScope.map((row) => row.product_id))
  for (const product of data.products) productIds.add(product.id)
  const activeAssigneeIds = new Set(data.changeAssigneeOptions.map((item) => item.id))
  for (const profile of data.profiles) {
    if (profile.is_active !== false) activeAssigneeIds.add(profile.id)
  }

  return tasks.map((task) => {
    if (!task.product_id || !productIds.has(task.product_id)) {
      throw new UserFacingError('선택한 제품 정보를 다시 확인해 주세요.')
    }
    if (seen.has(task.product_id)) throw new UserFacingError('같은 제품을 두 번 선택했어요. 하나를 빼 주세요.')
    seen.add(task.product_id)
    if (task.assignee_id && !activeAssigneeIds.has(task.assignee_id)) {
      throw new UserFacingError('활성 상태인 사람만 담당자로 정할 수 있어요. 다른 담당자를 골라 주세요.')
    }
    const currentAssigneeIds = new Set(
      data.changeProductScope
        .filter((row) => row.product_id === task.product_id && row.assignee_id && row.assignee_name)
        .map((row) => row.assignee_id as string),
    )
    if (task.assignee_id && currentAssigneeIds.size > 0 && !currentAssigneeIds.has(task.assignee_id)) {
      throw new UserFacingError('현재 제품 담당자 중 한 명을 이 업무 담당자로 선택해 주세요.')
    }
    return {
      product_id: task.product_id,
      assignee_id: task.assignee_id || null,
      product_note: optional(task.product_note ?? null, 2000, '제품별 메모'),
    }
  })
}

export function normalizeChangeApplicationInput(
  data: AppData,
  input: ChangeApplicationInput,
): ChangeApplicationInput {
  if (input.changeApplicationId) {
    const currentApplication = data.changeApplications.find(
      (application) => application.id === input.changeApplicationId,
    )
    if (
      !currentApplication
      || !input.expected_updated_at
      || currentApplication.updated_at !== input.expected_updated_at
    ) {
      throw new UserFacingError(CHANGE_APPLICATION_STALE_MESSAGE)
    }
    const contexts = selectProductChangeTaskContexts(data).filter(
      (context) => context.application.id === input.changeApplicationId,
    )
    if (contexts.some(({ task }) => task.status === 'cancelled')) {
      throw new UserFacingError(CHANGE_CONTENT_LOCKED_MESSAGE)
    }
  }

  const changeNumber = input.change_number.trim().toUpperCase()
  if (input.source === 'official' && !changeNumber) {
    throw new UserFacingError('공식 변경번호를 입력해 주세요.')
  }
  if (changeNumber.length > 100) throw new UserFacingError('변경번호는 100자 이하로 입력해 주세요.')
  const duplicate = data.changeApplications.find(
    (item) => item.id !== input.changeApplicationId && item.change_number.trim().toUpperCase() === changeNumber,
  )
  if (changeNumber && duplicate) {
    throw new UserFacingError(`이미 등록된 변경번호예요(${duplicate.change_number}). 기존 공통변경을 확인해 주세요.`)
  }

  const sourceUrl = optional(input.source_url, 2000, '공식 문서 링크')
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl)
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('unsupported protocol')
    } catch {
      throw new UserFacingError('공식 문서 링크는 http 또는 https 주소로 입력해 주세요.')
    }
  }
  if (!input.effective_date) throw new UserFacingError('시행일을 선택해 주세요.')
  if (!input.due_date) throw new UserFacingError('적용 기한을 선택해 주세요.')
  const customKindName = input.action_kind === 'other'
    ? required(input.custom_kind_name ?? '', '기타 항목명', 100)
    : null

  return {
    ...input,
    change_number: changeNumber,
    title: required(input.title, '변경 제목', 200),
    summary: required(input.summary, '변경 요약', 5000),
    source_url: sourceUrl,
    custom_kind_name: customKindName,
    action_content: required(input.action_content, '적용 내용', 5000),
    tasks: normalizeTasks(data, input.tasks),
  }
}

export function normalizeTaskReason(value: string, label: string) {
  return required(value, label, 2000)
}

export function normalizeOptionalTaskNote(value: string, label: string) {
  return optional(value, 2000, label) ?? ''
}
