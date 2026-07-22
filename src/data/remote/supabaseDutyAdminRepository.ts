import { supabase } from '../../lib/supabase'
import type { DutyAdminRepository, RepositoryDeps } from '../repositories/types'
import {
  assertMasterVersion,
  deleteMasterIfCurrent,
  makeMasterCorrelationId,
  normalizeMasterReason,
  runMasterOccRpc,
} from './supabaseMasterShared'

export function createSupabaseDutyAdminRepository(ctx: RepositoryDeps): DutyAdminRepository {
  const { data, setData } = ctx

  return {
    async addDutyMajorCategory(payload) {
      const { error } = await supabase!.from('duty_major_categories').insert(payload)
      if (error) throw error
    },

    async addDuty(payload) {
      const { error } = await supabase!.from('duties').insert(payload)
      if (error) throw error
    },

    async saveDutyAssignments({ dutyId, nextMemberIds, reason, duty, expectedUpdatedAt }) {
      const resolvedExpectedUpdatedAt = assertMasterVersion(
        expectedUpdatedAt
          ?? (duty && 'updated_at' in duty ? (duty as { updated_at?: string }).updated_at : undefined)
          ?? data.duties.find((item) => item.id === dutyId)?.updated_at,
      )
      const updatedAt = await runMasterOccRpc<string>('replace_duty_assignments_if_current', {
        p_duty_id: dutyId,
        p_member_ids: nextMemberIds,
        p_expected_updated_at: resolvedExpectedUpdatedAt,
        p_reason: normalizeMasterReason(reason),
        p_correlation_id: makeMasterCorrelationId(),
      })
      const noop = typeof updatedAt === 'string' && updatedAt === resolvedExpectedUpdatedAt
      if (typeof updatedAt === 'string' && !noop) {
        setData((current) => ({
          ...current,
          duties: current.duties.map((item) => (item.id === dutyId ? { ...item, updated_at: updatedAt } : item)),
        }))
      }
      return { noop }
    },

    async assignDuty({ userId, dutyId }) {
      // try_add_duty_assignment returns whether a row was actually inserted.
      const { data: inserted, error } = await supabase!.rpc('try_add_duty_assignment', {
        p_duty_id: dutyId,
        p_user_id: userId,
      })
      if (error) throw error
      return Boolean(inserted)
    },

    async updateDutyMajorCategory(majorCategoryId, payload) {
      const reason = normalizeMasterReason(payload.reason)
      const expectedUpdatedAt = assertMasterVersion(payload.expectedUpdatedAt)
      const updatedAt = await runMasterOccRpc<string>('update_duty_major_category_if_current', {
        p_major_category_id: majorCategoryId,
        p_expected_updated_at: expectedUpdatedAt,
        p_name: payload.name,
        p_sort_order: payload.sort_order ?? null,
        p_reason: reason,
        p_correlation_id: makeMasterCorrelationId(),
      })
      if (typeof updatedAt === 'string') {
        setData((current) => ({
          ...current,
          dutyMajorCategories: current.dutyMajorCategories.map((item) =>
            item.id === majorCategoryId ? { ...item, updated_at: updatedAt } : item,
          ),
        }))
      }
      return { noop: updatedAt === expectedUpdatedAt }
    },

    async updateDuty(dutyId, payload) {
      const reason = normalizeMasterReason(payload.reason)
      const expectedUpdatedAt = assertMasterVersion(payload.expectedUpdatedAt)
      const updatedAt = await runMasterOccRpc<string>('update_duty_if_current', {
        p_duty_id: dutyId,
        p_expected_updated_at: expectedUpdatedAt,
        p_name: payload.name,
        p_major_category_id: payload.major_category_id,
        p_sort_order: payload.sort_order ?? null,
        p_assignee_label: payload.assignee_label ?? null,
        p_notes: payload.notes ?? null,
        p_reason: reason,
        p_correlation_id: makeMasterCorrelationId(),
      })
      if (typeof updatedAt === 'string') {
        setData((current) => ({
          ...current,
          duties: current.duties.map((item) => (item.id === dutyId ? { ...item, updated_at: updatedAt } : item)),
        }))
      }
      return { noop: updatedAt === expectedUpdatedAt }
    },

    async deleteDuty(id, input) {
      const duty = data.duties.find((item) => item.id === id)
      await deleteMasterIfCurrent('delete_duty_if_current', id, input)
      return duty?.name ?? null
    },

    async deleteDutyMajorCategory(id, input) {
      const category = data.dutyMajorCategories.find((item) => item.id === id)
      await deleteMasterIfCurrent('delete_duty_major_category_if_current', id, input)
      return category?.name ?? null
    },
  }
}
