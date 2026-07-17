import { UserFacingError } from '../../lib/errors'
import type { Announcement } from '../../types'
import { createLocalAnnouncementRepository } from '../local/localAnnouncementRepository'
import type { AnnouncementPayload as RawAnnouncementPayload } from '../local/appDataReducers'
import { createSupabaseAnnouncementRepository } from '../remote/supabaseAnnouncementRepository'
import type { RepositoryContext } from '../repositoryContext'

export type AnnouncementPayload = RawAnnouncementPayload

function normalizeAnnouncementPayload(payload: AnnouncementPayload): AnnouncementPayload {
  const title = payload.title.trim()
  const body = payload.body.trim()
  if (!title) throw new UserFacingError('공지 제목을 입력해 주세요.')
  if (!body) throw new UserFacingError('공지 내용을 입력해 주세요.')
  if (title.length > 200) throw new UserFacingError('공지 제목은 200자 이하로 입력해 주세요.')
  if (body.length > 20_000) throw new UserFacingError('공지 내용은 20,000자 이하로 입력해 주세요.')
  return { title, body, is_pinned: payload.is_pinned }
}

function announcementRepository(ctx: RepositoryContext) {
  return ctx.isRemote
    ? createSupabaseAnnouncementRepository(ctx)
    : createLocalAnnouncementRepository(ctx)
}

export async function saveAnnouncement(
  ctx: RepositoryContext,
  input: {
    editingAnnouncementId: string | null
    expectedUpdatedAt: string | null
    payload: AnnouncementPayload
  },
): Promise<void> {
  return announcementRepository(ctx).saveAnnouncement({
    editingAnnouncementId: input.editingAnnouncementId,
    expectedUpdatedAt: input.expectedUpdatedAt,
    payload: normalizeAnnouncementPayload(input.payload),
  })
}

export async function toggleAnnouncementPin(
  ctx: RepositoryContext,
  announcement: Announcement,
): Promise<void> {
  return announcementRepository(ctx).toggleAnnouncementPin(announcement)
}

export async function deleteAnnouncement(
  ctx: RepositoryContext,
  announcement: Announcement,
): Promise<void> {
  return announcementRepository(ctx).deleteAnnouncement(announcement)
}
