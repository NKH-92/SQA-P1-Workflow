import { describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../demoData'
import { createRepositoryContextForMode } from './repositoryContext'

describe('RepositoryContext composition root', () => {
  it.each([
    ['local', false],
    ['remote', true],
  ] as const)('creates a complete %s context once', (mode, remoteCapability) => {
    const context = createRepositoryContextForMode(
      mode,
      previewLeader,
      createPreviewData(),
      vi.fn(),
    )

    expect(context.mode).toBe(mode)
    expect(context.capabilities).toEqual({
      historyIsCapped: remoteCapability,
      supportsAuditFeed: remoteCapability,
    })
    expect(context.repositories).toBe(context.repositories)
    expect(context.repositories).toEqual(expect.objectContaining({
      announcements: expect.any(Object),
      changeApplications: expect.any(Object),
      master: expect.any(Object),
      projects: expect.any(Object),
      reviews: expect.any(Object),
    }))
    expect(Object.prototype.hasOwnProperty.call(context, 'isRemote')).toBe(false)
  })
})
