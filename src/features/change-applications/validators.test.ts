import { describe, expect, it } from 'vitest'
import { emptyData } from '../../app/constants'
import type { AppData } from '../../types'
import type { ChangeApplicationInput } from './types'
import { normalizeChangeApplicationInput } from './validators'

const data: AppData = {
  ...emptyData,
  changeProductScope: [
    { product_id: 'p1', product_name: 'A정', category: '자사', company_name: '자사', sort_order: 1, assignee_id: 'm1', assignee_name: '담당자' },
  ],
  changeAssigneeOptions: [{ id: 'm1', name: '담당자', role: 'member' }],
}

function input(overrides: Partial<ChangeApplicationInput> = {}): ChangeApplicationInput {
  return {
    changeApplicationId: null,
    expected_updated_at: null,
    change_number: ' cc-2026-001 ',
    source: 'official',
    title: ' 제조원 변경 ',
    summary: ' 공급처 변경 ',
    source_url: 'https://example.com/change',
    effective_date: '2026-08-01',
    action_kind: 'product_standard',
    custom_kind_name: null,
    action_content: ' 표준서 반영 ',
    due_date: '2026-07-28',
    tasks: [{ product_id: 'p1', assignee_id: null }],
    ...overrides,
  }
}

describe('normalizeChangeApplicationInput', () => {
  it('normalizes common content and permits a deliberately unassigned product', () => {
    const normalized = normalizeChangeApplicationInput(data, input())
    expect(normalized.change_number).toBe('CC-2026-001')
    expect(normalized.title).toBe('제조원 변경')
    expect(normalized.tasks).toEqual([{ product_id: 'p1', assignee_id: null, product_note: null }])
  })

  it('allows internal work to leave the number blank for server generation', () => {
    expect(normalizeChangeApplicationInput(data, input({ source: 'internal', change_number: '' })).change_number).toBe('')
  })

  it('blocks duplicate change numbers before the RPC', () => {
    const existing = { ...data, changeApplications: [{
      id: 'existing', change_number: 'CC-2026-001', source: 'official' as const, title: '기존', summary: '기존', source_url: null,
      effective_date: '2026-08-01', status: 'published' as const, created_by: 'm1', published_at: null,
      cancelled_at: null, cancellation_reason: null, created_at: '', updated_at: '',
    }] }
    expect(() => normalizeChangeApplicationInput(existing, input())).toThrow('이미 등록')
  })

  it('blocks duplicate products and unsafe source links', () => {
    expect(() => normalizeChangeApplicationInput(data, input({
      tasks: [{ product_id: 'p1', assignee_id: 'm1' }, { product_id: 'p1', assignee_id: 'm1' }],
    }))).toThrow('두 번 선택')
    expect(() => normalizeChangeApplicationInput(data, input({ source_url: 'javascript:alert(1)' }))).toThrow('http 또는 https')
  })

  it('uses current product assignees as the responsibility candidates', () => {
    const withAnotherActiveUser = {
      ...data,
      changeAssigneeOptions: [...data.changeAssigneeOptions, { id: 'm2', name: '다른 담당자', role: 'member' as const }],
    }

    expect(() => normalizeChangeApplicationInput(withAnotherActiveUser, input({
      tasks: [{ product_id: 'p1', assignee_id: 'm2' }],
    }))).toThrow('현재 제품 담당자 중 한 명')
  })

  it('rejects an edit when the application revision changed after the editor opened', () => {
    const updatedAt = '2026-07-17T01:00:00.000Z'
    const versioned: AppData = {
      ...data,
      changeApplications: [{
        id: 'change-1', change_number: 'CC-2026-001', source: 'official', title: '기존', summary: '기존', source_url: null,
        effective_date: '2026-08-01', status: 'draft', created_by: 'm1', published_at: null,
        cancelled_at: null, cancellation_reason: null, created_at: '2026-07-17T00:00:00.000Z', updated_at: updatedAt,
      }],
    }

    expect(() => normalizeChangeApplicationInput(versioned, input({
      changeApplicationId: 'change-1',
      expected_updated_at: '2026-07-17T00:30:00.000Z',
    }))).toThrow('다른 사용자가 변경건을 수정했습니다. 새로고침 후 다시 시도해 주세요.')

    expect(normalizeChangeApplicationInput(versioned, input({
      changeApplicationId: 'change-1',
      expected_updated_at: updatedAt,
    })).expected_updated_at).toBe(updatedAt)
  })

  it('blocks edits that would silently reactivate a cancelled product task', () => {
    const locked: AppData = {
      ...data,
      changeApplications: [{
        id: 'change-1', change_number: 'CC-2026-001', source: 'official', title: '기존', summary: '기존', source_url: null,
        effective_date: '2026-08-01', status: 'published', created_by: 'm1', published_at: null,
        cancelled_at: null, cancellation_reason: null, created_at: '', updated_at: '2026-07-17T01:00:00.000Z',
      }],
      changeActionItems: [{
        id: 'action-1', change_application_id: 'change-1', kind: 'product_standard', custom_kind_name: null,
        content: '기존', due_date: '2026-08-01', sort_order: 1, created_at: '', updated_at: '',
      }],
      productChangeTasks: [{
        id: 'task-1', action_item_id: 'action-1', product_id: 'p1', product_name: 'A정', assignee_id: 'm1', assignee_name: '담당자',
        status: 'cancelled', product_note: null, completion_note: null, resolution_reason: '취소', proxy_reason: null,
        completed_by: null, completed_by_name: null, completed_at: null, reopened_by: null, reopened_by_name: null,
        reopened_at: null, reopen_reason: null, created_at: '', updated_at: '',
      }],
    }

    expect(() => normalizeChangeApplicationInput(locked, input({
      changeApplicationId: 'change-1',
      expected_updated_at: '2026-07-17T01:00:00.000Z',
    }))).toThrow('한 제품이라도 처리된 뒤에는 변경 내용을 수정할 수 없습니다.')
  })
})
