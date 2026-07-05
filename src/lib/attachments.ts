import { supabase } from './supabase'

export const REVIEW_ATTACHMENTS_BUCKET = 'review-attachments'
export const STORAGE_ATTACHMENT_PREFIX = `storage://${REVIEW_ATTACHMENTS_BUCKET}/`
export const MAX_REVIEW_ATTACHMENT_BYTES = 10 * 1024 * 1024
export const ALLOWED_REVIEW_EXTENSIONS = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg', '.txt', '.zip']

export function isStorageAttachment(value?: string | null) {
  return Boolean(value?.startsWith(STORAGE_ATTACHMENT_PREFIX))
}

export function toStorageAttachmentUrl(path: string) {
  return `${STORAGE_ATTACHMENT_PREFIX}${path.replace(/^\/+/, '')}`
}

export function storagePathFromAttachment(value: string) {
  return value.slice(STORAGE_ATTACHMENT_PREFIX.length)
}

export function validateStorageAttachmentOwnership(userId: string, value?: string | null) {
  if (!value || !isStorageAttachment(value)) return null
  const ownerId = storagePathFromAttachment(value).split('/')[0]
  if (ownerId !== userId) {
    return '본인이 업로드한 파일만 첨부할 수 있습니다.'
  }
  return null
}

export function validateReviewAttachmentFile(file: File) {
  const lower = file.name.toLowerCase()
  if (!ALLOWED_REVIEW_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return '허용되지 않는 파일 형식입니다.'
  }
  if (file.size > MAX_REVIEW_ATTACHMENT_BYTES) {
    return '파일 크기는 10MB 이하여야 합니다.'
  }
  return null
}

export async function uploadReviewAttachment(userId: string, file: File) {
  if (!supabase) throw new Error('Supabase 설정이 필요합니다.')
  const validation = validateReviewAttachmentFile(file)
  if (validation) throw new Error(validation)

  const safeName = file.name.replace(/[^\w.\-()가-힣]/g, '_')
  const path = `${userId}/${crypto.randomUUID()}-${safeName}`
  const { error } = await supabase.storage.from(REVIEW_ATTACHMENTS_BUCKET).upload(path, file, { upsert: false })
  if (error) throw error
  return toStorageAttachmentUrl(path)
}

export async function resolveAttachmentHref(value?: string | null) {
  if (!value) return null
  if (!isStorageAttachment(value)) return value
  if (!supabase) return null
  const { data, error } = await supabase.storage
    .from(REVIEW_ATTACHMENTS_BUCKET)
    .createSignedUrl(storagePathFromAttachment(value), 3600)
  if (error) throw error
  return data.signedUrl
}
