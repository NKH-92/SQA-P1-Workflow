import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import { CORE_BOOTSTRAP_SCHEMA_VERSION, fetchCoreQueries } from './coreQueries'

function emptyCoreData() {
  return {
    profiles: [],
    leader_profiles: [],
    products: [],
    duty_major_categories: [],
    duties: [],
    product_assignments: [],
    duty_assignments: [],
    projects: [],
    project_assignments: [],
  }
}

describe('fetchCoreQueries single-snapshot core bootstrap', () => {
  beforeEach(() => mocks.rpc.mockReset())

  it('calls get_core_bootstrap_v2 exactly once and fans the envelope out into the legacy per-table result shape', async () => {
    const profiles = [{ id: 'p1' }]
    const products = [{ id: 'prod1' }]
    mocks.rpc.mockResolvedValue({
      data: {
        schema_version: CORE_BOOTSTRAP_SCHEMA_VERSION,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: { ...emptyCoreData(), profiles, products },
        warnings: [],
      },
      error: null,
    })

    const result = await fetchCoreQueries(mocks as unknown as NonNullable<Parameters<typeof fetchCoreQueries>[0]>)

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('get_core_bootstrap_v2')
    expect(result.profilesResult).toEqual({ data: profiles, error: null })
    expect(result.activeLeaderProfilesResult).toEqual({ data: [], error: null })
    expect(result.productsResult).toEqual({ data: products, error: null })
    expect(result.dutyMajorCategoriesResult).toEqual({ data: [], error: null })
    expect(result.projectsResult).toEqual({ data: [], error: null })
    expect(result.coreSnapshotAt).toBe('2026-07-20T00:00:00.000Z')
    expect(result.coreWarnings).toEqual([])
  })

  it('propagates the RPC error to every result slot instead of throwing, and reports no snapshot', async () => {
    const rpcError = { message: 'core bootstrap unavailable' }
    mocks.rpc.mockResolvedValue({ data: null, error: rpcError })

    const result = await fetchCoreQueries(mocks as unknown as NonNullable<Parameters<typeof fetchCoreQueries>[0]>)

    expect(result.profilesResult).toEqual({ data: null, error: rpcError })
    expect(result.projectAssignmentsResult).toEqual({ data: null, error: rpcError })
    expect(result.coreSnapshotAt).toBeNull()
  })

  it('fails closed when the required RPC returns a null envelope without an error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const result = await fetchCoreQueries(mocks as unknown as NonNullable<Parameters<typeof fetchCoreQueries>[0]>)

    expect(result.profilesResult.data).toBeNull()
    expect(result.profilesResult.error).toBeInstanceOf(Error)
    expect((result.profilesResult.error as Error).message).toContain('null envelope')
  })

  it('fails closed on a schema_version mismatch instead of reading an unrecognized shape', async () => {
    mocks.rpc.mockResolvedValue({
      data: { schema_version: 99, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyCoreData(), warnings: [] },
      error: null,
    })

    const result = await fetchCoreQueries(mocks as unknown as NonNullable<Parameters<typeof fetchCoreQueries>[0]>)

    expect(result.profilesResult.data).toBeNull()
    expect(result.profilesResult.error).toBeInstanceOf(Error)
    expect((result.profilesResult.error as Error).message).toContain('schema_version mismatch')
    expect(result.coreSnapshotAt).toBeNull()
  })

  it.each([
    ['snapshot_at', { schema_version: 2, snapshot_at: null, data: emptyCoreData(), warnings: [] }],
    ['warnings', { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyCoreData(), warnings: null }],
    ['data.products', { schema_version: 2, snapshot_at: '2026-07-20T00:00:00.000Z', data: { ...emptyCoreData(), products: undefined }, warnings: [] }],
  ])('fails closed when required field %s is absent or invalid', async (_field, data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    const result = await fetchCoreQueries(mocks as unknown as NonNullable<Parameters<typeof fetchCoreQueries>[0]>)
    expect(result.profilesResult.data).toBeNull()
    expect(result.profilesResult.error).toBeInstanceOf(Error)
    expect(result.coreSnapshotAt).toBeNull()
  })
})
