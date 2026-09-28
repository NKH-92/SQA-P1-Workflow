import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  fetchCoreQueries: vi.fn(),
  fetchReviewQueries: vi.fn(),
  fetchChangeQueries: vi.fn(),
  fetchOptionalQueries: vi.fn(),
  assembleAppData: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({ supabase: {} }))
vi.mock('./fetch/coreQueries', () => ({ fetchCoreQueries: mocks.fetchCoreQueries }))
vi.mock('./fetch/reviewQueries', () => ({ fetchReviewQueries: mocks.fetchReviewQueries }))
vi.mock('./fetch/changeQueries', () => ({ fetchChangeQueries: mocks.fetchChangeQueries }))
vi.mock('./fetch/optionalQueries', () => ({ fetchOptionalQueries: mocks.fetchOptionalQueries }))
vi.mock('./fetch/assembleAppData', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./fetch/assembleAppData')>()
  mocks.assembleAppData.mockImplementation(actual.assembleAppData)
  return { ...actual, assembleAppData: mocks.assembleAppData }
})

import { fetchAppData } from './fetchAppData'

const ok = { data: [], error: null }
const snapshotAt = '2026-09-28T00:00:00.000Z'

function coreResults(error: unknown = null) {
  const result = error ? { data: null, error } : ok
  return {
    profilesResult: result,
    activeLeaderProfilesResult: result,
    productsResult: result,
    dutyMajorCategoriesResult: result,
    dutiesResult: result,
    productAssignmentsResult: result,
    dutyAssignmentsResult: result,
    projectsResult: result,
    projectAssignmentsResult: result,
    coreSnapshotAt: error ? null : snapshotAt,
    coreWarnings: [],
  }
}

const reviewResults = {
  reviewRequestsResult: ok,
  reviewEventsResult: ok,
  reviewReadReceiptsResult: ok,
  reviewSnapshotAt: snapshotAt,
}

const changeResults = {
  changeApplicationsResult: ok,
  changeActionItemsResult: ok,
  productChangeTasksResult: ok,
  changeProductScopeResult: ok,
  changeAssigneeOptionsResult: ok,
  changeApplicationSummariesResult: ok,
  changeSnapshotAt: snapshotAt,
  changeWarnings: [],
}

const fulfilled = (value: unknown) => ({ status: 'fulfilled' as const, value: { data: value, error: null } })
const optionalResults = {
  allowedUsers: fulfilled([]),
  profileNotes: fulfilled([]),
  activityLogs: fulfilled([]),
  announcements: fulfilled([]),
  officeLayout: fulfilled(null),
  sectionReadMarks: fulfilled([]),
  officeMeeting: fulfilled(null),
  memberPresence: fulfilled(null),
}

afterEach(() => {
  mocks.fetchCoreQueries.mockReset()
  mocks.fetchReviewQueries.mockReset()
  mocks.fetchChangeQueries.mockReset()
  mocks.fetchOptionalQueries.mockReset()
  mocks.assembleAppData.mockClear()
})

describe('fetchAppData request ordering', () => {
  it('starts the optional queries together with the required bootstraps', async () => {
    let resolveCore!: (value: ReturnType<typeof coreResults>) => void
    mocks.fetchCoreQueries.mockReturnValue(new Promise((resolve) => { resolveCore = resolve }))
    mocks.fetchReviewQueries.mockResolvedValue(reviewResults)
    mocks.fetchChangeQueries.mockResolvedValue(changeResults)
    mocks.fetchOptionalQueries.mockResolvedValue(optionalResults)

    const pending = fetchAppData()
    // 필수 bootstrap이 끝나기 전에 부가 조회가 이미 나가 있다.
    expect(mocks.fetchOptionalQueries).toHaveBeenCalledTimes(1)

    resolveCore(coreResults())
    const result = await pending

    expect(mocks.assembleAppData).toHaveBeenCalledWith(
      expect.objectContaining({ profilesResult: ok }),
      optionalResults,
      expect.any(Function),
      undefined,
    )
    expect(result.snapshotAt).toBe(snapshotAt)
  })

  it('still throws the required failure and never uses the optional results', async () => {
    const requiredError = { code: '42501', message: 'permission denied' }
    mocks.fetchCoreQueries.mockResolvedValue(coreResults(requiredError))
    mocks.fetchReviewQueries.mockResolvedValue(reviewResults)
    mocks.fetchChangeQueries.mockResolvedValue(changeResults)
    mocks.fetchOptionalQueries.mockResolvedValue(optionalResults)

    await expect(fetchAppData()).rejects.toBe(requiredError)
    expect(mocks.assembleAppData).not.toHaveBeenCalled()
  })
})
