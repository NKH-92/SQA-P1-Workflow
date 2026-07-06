import { describe, expect, it, vi } from 'vitest'
import { UserFacingError, toUserMessage } from './errors'

vi.mock('./supabase', () => ({
  hasSupabaseConfig: true,
  supabase: {
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
      }),
    },
  },
}))

import { uploadReviewAttachment } from './attachments'

describe('attachments user messages', () => {
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
})
