import { describe, expect, it } from 'vitest'
import {
  isStorageAttachment,
  reviewAttachmentContentType,
  toStorageAttachmentUrl,
  validateReviewAttachmentFile,
  validateStorageAttachmentOwnership,
} from './attachments'

describe('attachments', () => {
  it('detects storage attachment URLs', () => {
    expect(isStorageAttachment('storage://review-attachments/user-1/file.pdf')).toBe(true)
    expect(isStorageAttachment('https://example.com/file.pdf')).toBe(false)
  })

  it('builds storage attachment URLs from paths', () => {
    expect(toStorageAttachmentUrl('user-1/file.pdf')).toBe('storage://review-attachments/user-1/file.pdf')
  })

  it('rejects unsupported file types and oversized files', () => {
    expect(validateReviewAttachmentFile({ name: 'report.exe', size: 100 } as File)).toBe(
      '허용되지 않는 파일 형식입니다.',
    )
    expect(validateReviewAttachmentFile({ name: 'report.pdf', size: 11 * 1024 * 1024 } as File)).toBe(
      '파일 크기는 10MB 이하여야 합니다.',
    )
    expect(validateReviewAttachmentFile({ name: 'report.pdf', size: 1024 } as File)).toBeNull()
  })

  it('requires storage attachment ownership to match the current user', () => {
    const own = toStorageAttachmentUrl('user-1/file.pdf')
    const other = toStorageAttachmentUrl('user-2/file.pdf')

    expect(validateStorageAttachmentOwnership('user-1', own)).toBeNull()
    expect(validateStorageAttachmentOwnership('user-1', other)).toBe('본인이 업로드한 파일만 첨부할 수 있습니다.')
    expect(validateStorageAttachmentOwnership('user-1', 'https://example.com/file.pdf')).toBeNull()
    expect(validateStorageAttachmentOwnership('user-1', null)).toBeNull()
  })

  it('normalizes allowed attachment extensions to standard MIME types', () => {
    expect(reviewAttachmentContentType('bundle.ZIP')).toBe('application/zip')
    expect(reviewAttachmentContentType('report.docx')).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    expect(reviewAttachmentContentType('photo.jpeg')).toBe('image/jpeg')
    expect(reviewAttachmentContentType('payload.exe')).toBeUndefined()
  })
})
