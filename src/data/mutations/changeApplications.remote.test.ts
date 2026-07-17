import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader } from '../../demoData'
import type { ChangeApplicationInput } from '../contracts'
import type { AppData } from '../../types'
import type { RepositoryContext } from '../repositoryContext'

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(async (): Promise<{ data: unknown; error: { message: string } | null }> => ({
    data: 'change-application-new',
    error: null,
  })),
}))

vi.mock('../../lib/supabase', () => ({
  hasSupabaseConfig: true,
  supabase: { rpc: mocks.rpc },
}))

import { archiveChangeApplication, restoreChangeApplication, saveChangeApplication } from './changeApplications'

function remoteContext(data = createPreviewData()): RepositoryContext {
  return {
    isRemote: true,
    profile: previewLeader,
    data,
    setData: vi.fn(),
  }
}

function newInput(data: AppData): ChangeApplicationInput {
  return {
    changeApplicationId: null,
    expected_updated_at: null,
    change_number: 'CC-TEST-REMOTE-001',
    source: 'official',
    title: '원격 원자 등록',
    summary: '원격 등록 revision 계약을 검증합니다.',
    source_url: null,
    effective_date: '2026-09-01',
    action_kind: 'product_standard',
    custom_kind_name: null,
    action_content: '제품표준서를 개정합니다.',
    due_date: '2026-08-28',
    tasks: [{ product_id: data.changeProductScope[0].product_id, assignee_id: null }],
  }
}

function draftEditInput(data: AppData): ChangeApplicationInput {
  const application = data.changeApplications.find((item) => item.id === 'change-application-draft-01')!
  const action = data.changeActionItems.find((item) => item.change_application_id === application.id)!
  return {
    changeApplicationId: application.id,
    expected_updated_at: application.updated_at,
    change_number: application.change_number,
    source: application.source,
    title: application.title,
    summary: application.summary,
    source_url: application.source_url,
    effective_date: application.effective_date!,
    action_kind: action.kind,
    custom_kind_name: action.custom_kind_name,
    action_content: action.content,
    due_date: action.due_date,
    tasks: data.productChangeTasks
      .filter((task) => task.action_item_id === action.id)
      .map((task) => ({
        product_id: task.product_id,
        assignee_id: task.assignee_id,
        product_note: task.product_note,
      })),
  }
}

describe('change application mutation contracts (remote)', () => {
  beforeEach(() => {
    mocks.rpc.mockReset().mockResolvedValue({ data: 'change-application-new', error: null })
  })

  it('passes a null expected revision when publishing a new application', async () => {
    const ctx = remoteContext()
    const input = newInput(ctx.data)

    await saveChangeApplication(ctx, input, true)

    expect(mocks.rpc).toHaveBeenCalledWith('publish_change_application', expect.objectContaining({
      p_change_application_id: null,
      p_expected_updated_at: null,
    }))
  })

  it('passes the editor snapshot revision when saving an existing draft', async () => {
    const ctx = remoteContext()
    const input = draftEditInput(ctx.data)
    mocks.rpc.mockResolvedValueOnce({ data: input.changeApplicationId, error: null })

    await saveChangeApplication(ctx, input, false)

    expect(mocks.rpc).toHaveBeenCalledWith('save_change_application_draft', expect.objectContaining({
      p_change_application_id: input.changeApplicationId,
      p_expected_updated_at: input.expected_updated_at,
    }))
  })

  it('translates the database OCC rejection into the shared user-facing conflict', async () => {
    const ctx = remoteContext()
    const input = draftEditInput(ctx.data)
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'change application was modified by another user' },
    })

    await expect(saveChangeApplication(ctx, input, false)).rejects.toThrow(
      '다른 사용자가 변경건을 수정했습니다. 새로고침 후 다시 시도해 주세요.',
    )
  })

  it('uses explicit archive and restore RPC contracts', async () => {
    const ctx = remoteContext()

    await archiveChangeApplication(ctx, 'application-1', '모든 제품 처리 완료')
    expect(mocks.rpc).toHaveBeenLastCalledWith('archive_change_application', {
      p_change_application_id: 'application-1',
      p_reason: '모든 제품 처리 완료',
    })

    await restoreChangeApplication(ctx, 'application-1', '추가 반영 필요')
    expect(mocks.rpc).toHaveBeenLastCalledWith('restore_change_application', {
      p_change_application_id: 'application-1',
      p_reason: '추가 반영 필요',
    })
  })
})
