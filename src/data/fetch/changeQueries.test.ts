import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
  from: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc, from: mocks.from },
}))

import { CHANGE_BOOTSTRAP_SCHEMA_VERSION, fetchChangeQueries } from './changeQueries'

function emptyChangeData() {
  return {
    change_applications: [],
    change_action_items: [],
    product_change_tasks: [],
    change_product_scope: [],
    change_assignee_options: [],
  }
}

describe('fetchChangeQueries single-snapshot change bootstrap', () => {
  beforeEach(() => {
    mocks.rpc.mockReset()
    mocks.from.mockReset()
  })

  it('calls get_change_bootstrap_v2 exactly once and fans the envelope out into the legacy per-table result shape', async () => {
    const applications = [{ id: 'app1' }]
    const scope = [{ product_id: 'prod1' }]
    mocks.rpc.mockResolvedValue({
      data: {
        schema_version: CHANGE_BOOTSTRAP_SCHEMA_VERSION,
        snapshot_at: '2026-07-20T00:00:00.000Z',
        data: { ...emptyChangeData(), change_applications: applications, change_product_scope: scope },
        warnings: ['[SQA_CHANGE_APPLICATIONS_TRUNCATED] latest rows only'],
      },
      error: null,
    })

    const result = await fetchChangeQueries(mocks as unknown as NonNullable<Parameters<typeof fetchChangeQueries>[0]>)

    expect(mocks.rpc).toHaveBeenCalledTimes(1)
    expect(mocks.rpc).toHaveBeenCalledWith('get_change_bootstrap_v2')
    expect(result.changeApplicationsResult).toEqual({ data: applications, error: null })
    expect(result.changeProductScopeResult).toEqual({ data: scope, error: null })
    expect(result.changeActionItemsResult).toEqual({ data: [], error: null })
    expect(result.changeSnapshotAt).toBe('2026-07-20T00:00:00.000Z')
    expect(result.changeWarnings).toEqual(['[SQA_CHANGE_APPLICATIONS_TRUNCATED] latest rows only'])
  })

  it('propagates the RPC error to every result slot instead of throwing, and reports no snapshot', async () => {
    const rpcError = { message: 'change bootstrap unavailable' }
    mocks.rpc.mockResolvedValue({ data: null, error: rpcError })

    const result = await fetchChangeQueries(mocks as unknown as NonNullable<Parameters<typeof fetchChangeQueries>[0]>)

    expect(result.changeApplicationsResult).toEqual({ data: null, error: rpcError })
    expect(result.changeAssigneeOptionsResult).toEqual({ data: null, error: rpcError })
    expect(result.changeSnapshotAt).toBeNull()
  })

  it('fails closed when the required RPC returns a null envelope without an error', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null })

    const result = await fetchChangeQueries(mocks as unknown as NonNullable<Parameters<typeof fetchChangeQueries>[0]>)

    expect(result.changeApplicationsResult.data).toBeNull()
    expect(result.changeApplicationsResult.error).toBeInstanceOf(Error)
    expect((result.changeApplicationsResult.error as Error).message).toContain('null envelope')
  })

  it('fails closed on a schema_version mismatch instead of reading an unrecognized shape', async () => {
    mocks.rpc.mockResolvedValue({
      data: { schema_version: 99, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyChangeData(), warnings: [] },
      error: null,
    })

    const result = await fetchChangeQueries(mocks as unknown as NonNullable<Parameters<typeof fetchChangeQueries>[0]>)

    expect(result.changeApplicationsResult.data).toBeNull()
    expect(result.changeApplicationsResult.error).toBeInstanceOf(Error)
    expect((result.changeApplicationsResult.error as Error).message).toContain('schema_version mismatch')
    expect(result.changeSnapshotAt).toBeNull()
  })

  it.each([
    ['snapshot_at', { schema_version: 1, snapshot_at: 'not-a-date', data: emptyChangeData(), warnings: [] }],
    ['warnings', { schema_version: 1, snapshot_at: '2026-07-20T00:00:00.000Z', data: emptyChangeData(), warnings: [1] }],
    ['data.product_change_tasks', { schema_version: 1, snapshot_at: '2026-07-20T00:00:00.000Z', data: { ...emptyChangeData(), product_change_tasks: null }, warnings: [] }],
  ])('fails closed when required field %s is absent or invalid', async (_field, data) => {
    mocks.rpc.mockResolvedValue({ data, error: null })
    const result = await fetchChangeQueries(mocks as unknown as NonNullable<Parameters<typeof fetchChangeQueries>[0]>)
    expect(result.changeApplicationsResult.data).toBeNull()
    expect(result.changeApplicationsResult.error).toBeInstanceOf(Error)
    expect(result.changeSnapshotAt).toBeNull()
  })
})
