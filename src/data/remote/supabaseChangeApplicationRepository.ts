import { UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ChangeApplicationRepository, RepositoryDeps } from '../repositories/types'
import { CHANGE_APPLICATION_STALE_MESSAGE } from '../validation/changeApplications'

function translateChangeError(error: { message?: string }) {
  const message = error.message ?? ''
  if (message.includes('change_applications_change_number_key') || message.includes('duplicate key')) {
    return new UserFacingError('이미 등록된 변경번호입니다. 기존 변경건을 확인해 주세요.')
  }
  if (message.includes('locked after the first processed task')) {
    return new UserFacingError('한 제품이라도 처리된 뒤에는 변경 내용을 수정할 수 없습니다.')
  }
  if (message.includes('change application was modified by another user')) {
    return new UserFacingError(CHANGE_APPLICATION_STALE_MESSAGE)
  }
  if (message.includes('not pending')) {
    return new UserFacingError('이미 다른 사용자가 처리한 업무입니다. 목록을 새로고침해 주세요.')
  }
  if (message.includes('has pending product tasks')) {
    return new UserFacingError('미완료 제품 업무가 남아 있어 보관할 수 없습니다.')
  }
  if (message.includes('has no product tasks')) {
    return new UserFacingError('제품 적용업무가 없는 변경건은 보관할 수 없습니다.')
  }
  if (message.includes('already archived')) {
    return new UserFacingError('이미 보관된 변경건입니다.')
  }
  if (message.includes('is not archived')) {
    return new UserFacingError('보관되지 않은 변경건입니다.')
  }
  return error
}

export function createSupabaseChangeApplicationRepository(
  _ctx: RepositoryDeps,
): ChangeApplicationRepository {
  return {
    async saveChangeApplication(input, publish) {
      const { data, error } = await supabase!.rpc(
        publish ? 'publish_change_application' : 'save_change_application_draft',
        {
          p_change_application_id: input.changeApplicationId,
          p_expected_updated_at: input.expected_updated_at,
          p_change_number: input.change_number,
          p_source: input.source,
          p_title: input.title,
          p_summary: input.summary,
          p_source_url: input.source_url,
          p_effective_date: input.effective_date,
          p_action_kind: input.action_kind,
          p_custom_kind_name: input.custom_kind_name,
          p_action_content: input.action_content,
          p_due_date: input.due_date,
          p_tasks: input.tasks,
        },
      )
      if (error) throw translateChangeError(error)
      if (typeof data !== 'string') throw new UserFacingError('변경 적용업무 등록 결과를 확인할 수 없습니다.')
      return data
    },

    async completeProductTask(taskId, completionNote, proxyReason) {
      const { error } = await supabase!.rpc('complete_product_change_task', {
        p_task_id: taskId,
        p_completion_note: completionNote || null,
        p_proxy_reason: proxyReason || null,
      })
      if (error) throw translateChangeError(error)
    },

    async markProductTaskNotApplicable(taskId, reason, proxyReason) {
      const { error } = await supabase!.rpc('mark_product_change_task_not_applicable', {
        p_task_id: taskId,
        p_reason: reason,
        p_proxy_reason: proxyReason || null,
      })
      if (error) throw translateChangeError(error)
    },

    async reopenProductTask(taskId, reason) {
      const { error } = await supabase!.rpc('reopen_product_change_task', {
        p_task_id: taskId,
        p_reason: reason,
      })
      if (error) throw translateChangeError(error)
    },

    async reassignProductTasks(taskIds, assigneeId, reason) {
      const { error } = await supabase!.rpc('reassign_product_change_tasks', {
        p_task_ids: taskIds,
        p_assignee_id: assigneeId,
        p_reason: reason,
      })
      if (error) throw translateChangeError(error)
    },

    async cancelProductTask(taskId, reason) {
      const { error } = await supabase!.rpc('cancel_product_change_task', {
        p_task_id: taskId,
        p_reason: reason,
      })
      if (error) throw translateChangeError(error)
    },

    async cancelChangeApplication(changeApplicationId, reason) {
      const { error } = await supabase!.rpc('cancel_change_application', {
        p_change_application_id: changeApplicationId,
        p_reason: reason,
      })
      if (error) throw translateChangeError(error)
    },

    async archiveChangeApplication(changeApplicationId, reason) {
      const { error } = await supabase!.rpc('archive_change_application', {
        p_change_application_id: changeApplicationId,
        p_reason: reason,
      })
      if (error) throw translateChangeError(error)
    },

    async restoreChangeApplication(changeApplicationId, reason) {
      const { error } = await supabase!.rpc('restore_change_application', {
        p_change_application_id: changeApplicationId,
        p_reason: reason,
      })
      if (error) throw translateChangeError(error)
    },
  }
}
