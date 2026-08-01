import { UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { ChangeApplicationRepository, RepositoryDeps } from '../repositories/types'
import { translateChangeApplicationError } from './changeApplicationError'

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
      if (error) throw translateChangeApplicationError(error)
      if (typeof data !== 'string') throw new UserFacingError('변경 적용업무 등록 결과를 확인할 수 없습니다.')
      return data
    },

    async completeProductTask(taskId, completionNote, proxyReason) {
      const { error } = await supabase!.rpc('complete_product_change_task', {
        p_task_id: taskId,
        p_completion_note: completionNote || null,
        p_proxy_reason: proxyReason || null,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async markProductTaskNotApplicable(taskId, reason, proxyReason) {
      const { error } = await supabase!.rpc('mark_product_change_task_not_applicable', {
        p_task_id: taskId,
        p_reason: reason,
        p_proxy_reason: proxyReason || null,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async reopenProductTask(taskId, reason) {
      const { error } = await supabase!.rpc('reopen_product_change_task', {
        p_task_id: taskId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async reassignProductTasks(taskIds, assigneeId, reason) {
      const { error } = await supabase!.rpc('reassign_product_change_tasks', {
        p_task_ids: taskIds,
        p_assignee_id: assigneeId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async cancelProductTask(taskId, reason) {
      const { error } = await supabase!.rpc('cancel_product_change_task', {
        p_task_id: taskId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async removeProductChangeScope(taskId, reason) {
      const { error } = await supabase!.rpc('remove_product_from_change_scope', {
        p_task_id: taskId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async restoreProductChangeScope(taskId, reason) {
      const { error } = await supabase!.rpc('restore_product_change_scope', {
        p_task_id: taskId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async cancelChangeApplication(changeApplicationId, reason) {
      const { error } = await supabase!.rpc('cancel_change_application', {
        p_change_application_id: changeApplicationId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async finalizeChangeApplication(input) {
      const { error } = await supabase!.rpc('complete_change_application', {
        p_change_application_id: input.changeApplicationId,
        p_expected_updated_at: input.expected_updated_at,
        p_note: input.note || null,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async undoFinalizeChangeApplication(input) {
      const { error } = await supabase!.rpc('undo_change_application_completion', {
        p_change_application_id: input.changeApplicationId,
        p_expected_updated_at: input.expected_updated_at,
        p_reason: input.reason,
        p_reopen_tasks: input.reopen_tasks,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async archiveChangeApplication(changeApplicationId, reason) {
      const { error } = await supabase!.rpc('archive_change_application', {
        p_change_application_id: changeApplicationId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },

    async restoreChangeApplication(changeApplicationId, reason) {
      const { error } = await supabase!.rpc('restore_change_application', {
        p_change_application_id: changeApplicationId,
        p_reason: reason,
      })
      if (error) throw translateChangeApplicationError(error)
    },
  }
}
