import { assertAffectedRows, assertRecordExists, STALE_WRITE_MESSAGE, UserFacingError } from '../../lib/errors'
import { supabase } from '../../lib/supabase'
import type { AnnouncementRepository, RepositoryDeps } from '../repositories/types'

export function createSupabaseAnnouncementRepository(ctx: RepositoryDeps): AnnouncementRepository {
  const { data } = ctx

  return {
    async saveAnnouncement({ editingAnnouncementId, expectedUpdatedAt, payload }) {
      if (editingAnnouncementId) {
        const previous = data.announcements.find((item) => item.id === editingAnnouncementId)
        assertRecordExists(previous)
        if (!expectedUpdatedAt) {
          throw new UserFacingError(STALE_WRITE_MESSAGE)
        }
        const { data: affected, error } = await supabase!
          .from('announcements')
          .update({
            title: payload.title,
            body: payload.body,
            is_pinned: payload.is_pinned,
          })
          .eq('id', editingAnnouncementId)
          .eq('updated_at', expectedUpdatedAt)
          .select('id')
        if (error) throw error
        assertAffectedRows(affected)
        return
      }

      const { data: created, error } = await supabase!
        .from('announcements')
        .insert({
          title: payload.title,
          body: payload.body,
          is_pinned: payload.is_pinned,
        })
        .select('id')
        .single()
      if (error) throw error
      assertRecordExists(created)
    },

    async toggleAnnouncementPin(announcement) {
      const nextPinned = !announcement.is_pinned
      const { data: affected, error } = await supabase!
        .from('announcements')
        .update({ is_pinned: nextPinned })
        .eq('id', announcement.id)
        .eq('updated_at', announcement.updated_at)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
    },

    async deleteAnnouncement(announcement) {
      const { data: affected, error } = await supabase!
        .from('announcements')
        .delete()
        .eq('id', announcement.id)
        .eq('updated_at', announcement.updated_at)
        .select('id')
      if (error) throw error
      assertAffectedRows(affected)
    },
  }
}
