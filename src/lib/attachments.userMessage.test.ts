import { beforeEach, describe, expect, it, vi } from 'vitest'
import { UserFacingError, toUserMessage } from './errors'

const { uploadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async () => ({ error: null })),
}))

vi.mock('./supabase', () => ({
  hasSupabaseConfig: true,
  supabase: {
    storage: {
      from: () => ({
        upload: uploadMock,
      }),
    },
  },
}))

import { uploadReviewAttachment } from './attachments'

describe('attachments user messages', () => {
  beforeEach(() => {
    uploadMock.mockClear()
  })

  it('preserves validation messages via UserFacingError on upload', async () => {
    await expect(
      uploadReviewAttachment('user-1', { name: 'report.pdf', size: 11 * 1024 * 1024 } as File),
    ).rejects.toBeInstanceOf(UserFacingError)

    try {
      await uploadReviewAttachment('user-1', { name: 'report.pdf', size: 11 * 1024 * 1024 } as File)
    } catch (error) {
      expect(toUserMessage(error)).toBe('파일 크기는 10MB 이하여야 합니다.')
    }
  })

  it('uploads Windows ZIP files with the canonical application/zip MIME type', async () => {
    const file = { name: 'evidence.zip', size: 1024, type: 'application/x-zip-compressed' } as File

    await uploadReviewAttachment('user-1', file)

    expect(uploadMock).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/.+-evidence\.zip$/),
      file,
      { upsert: false, contentType: 'application/zip' },
    )
  })
})
