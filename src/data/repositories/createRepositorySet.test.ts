import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../../demoData'
import type { ActivityLogInput } from './activityLogWriter'

const mocks = vi.hoisted(() => {
  const insert = vi.fn(async () => ({ error: null }))
  return { insert, from: vi.fn(() => ({ insert })) }
})

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: false,
  supabase: { from: mocks.from },
}))

const logInput: ActivityLogInput = {
  actor: previewLeader,
  entityType: 'review_request',
  action: 'created',
  summary: '검토 요청을 등록했어요',
}

function deps() {
  return {
    profile: previewLeader,
    data: createPreviewData(),
    setData: vi.fn(),
  }
}

async function loadWithEnv(env: { DEV: boolean; VITE_APP_MODE?: string }) {
  vi.resetModules()
  vi.stubEnv('DEV', env.DEV)
  vi.stubEnv('VITE_APP_MODE', env.VITE_APP_MODE ?? '')
  return import('./createRepositorySet')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

describe('createRepositorySet local gate', () => {
  it('keeps local repositories for the dev server and vitest', async () => {
    const { createRepositorySet, LOCAL_REPOSITORIES_ENABLED } = await loadWithEnv({ DEV: true })
    const repositoryDeps = deps()
    const repositories = createRepositorySet('local', repositoryDeps)

    expect(LOCAL_REPOSITORIES_ENABLED).toBe(true)
    await repositories.activityLogs.write(logInput)
    expect(repositoryDeps.setData).toHaveBeenCalledTimes(1)
    expect(mocks.from).not.toHaveBeenCalled()
  })

  it('keeps local repositories for a preview build', async () => {
    const { createRepositorySet, LOCAL_REPOSITORIES_ENABLED } = await loadWithEnv({
      DEV: false,
      VITE_APP_MODE: 'preview',
    })
    const repositoryDeps = deps()

    expect(LOCAL_REPOSITORIES_ENABLED).toBe(true)
    await createRepositorySet('local', repositoryDeps).activityLogs.write(logInput)
    expect(repositoryDeps.setData).toHaveBeenCalledTimes(1)
  })

  it('drops local repositories from production builds but keeps remote ones', async () => {
    const { createRepositorySet, LOCAL_REPOSITORIES_ENABLED } = await loadWithEnv({
      DEV: false,
      VITE_APP_MODE: 'production',
    })
    const repositoryDeps = deps()

    expect(LOCAL_REPOSITORIES_ENABLED).toBe(false)
    expect(() => createRepositorySet('local', repositoryDeps)).toThrow('local repositories are unavailable in this build')

    await createRepositorySet('remote', repositoryDeps).activityLogs.write(logInput)
    expect(mocks.from).toHaveBeenCalledWith('activity_logs')
    expect(repositoryDeps.setData).not.toHaveBeenCalled()
  })
})
