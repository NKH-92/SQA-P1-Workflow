import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createPreviewData } from '../demoData'
import type { AppData, AuditEvent } from '../types'
import { ActivityPanel } from './ActivityPanel'

const events: AuditEvent[] = [
  {
    id: 5,
    entity_type: 'announcement',
    entity_id: '00000000-0000-0000-0000-000000000005',
    action: 'inserted',
    actor_id: null,
    actor_name: '파트장',
    changed_fields: ['body', 'id', 'title'],
    before_delta: {},
    after_delta: {
      id: '00000000-0000-0000-0000-000000000005',
      title: '<img src=x onerror=alert(1)>',
      body: '생성 당시 업무 본문',
    },
    reason: null,
    source: 'database',
    changed_at: '2026-07-18T15:00:00.000Z',
  },
  {
    id: 4,
    entity_type: 'project',
    entity_id: '00000000-0000-0000-0000-000000000004',
    action: 'updated',
    actor_id: null,
    actor_name: '파트장',
    changed_fields: ['name'],
    before_delta: { name: '이전 프로젝트' },
    after_delta: { name: '이후 프로젝트' },
    reason: '명칭 정리',
    source: 'project_update',
    changed_at: '2026-07-18T14:00:00.000Z',
  },
  {
    id: 3,
    entity_type: 'profile_note',
    entity_id: '00000000-0000-0000-0000-000000000003',
    action: 'deleted',
    actor_id: null,
    actor_name: '파트장',
    changed_fields: ['id', 'note'],
    before_delta: {
      id: '00000000-0000-0000-0000-000000000003',
      note: '삭제 직전 메모',
    },
    after_delta: {},
    reason: null,
    source: 'database',
    changed_at: '2026-07-18T13:00:00.000Z',
  },
  {
    id: 2,
    entity_type: 'product',
    entity_id: '00000000-0000-0000-0000-000000000002',
    action: 'deleted',
    actor_id: null,
    actor_name: '시스템',
    changed_fields: ['id'],
    before_delta: { id: '00000000-0000-0000-0000-000000000002' },
    after_delta: {},
    reason: null,
    source: 'database',
    changed_at: '2026-07-18T12:00:00.000Z',
  },
  {
    id: 1,
    entity_type: 'profile',
    entity_id: '00000000-0000-0000-0000-000000000001',
    action: 'inserted',
    actor_id: null,
    actor_name: '시스템',
    changed_fields: ['id', 'must_change_password', 'password', 'access_token'],
    before_delta: {},
    after_delta: {
      id: '00000000-0000-0000-0000-000000000001',
      must_change_password: true,
      password: 'must-never-render',
      access_token: 'also-must-never-render',
    },
    reason: null,
    source: 'legacy',
    changed_at: '2026-07-18T11:00:00.000Z',
  },
]

function renderPanel() {
  const data: AppData = { ...createPreviewData(), auditEvents: events }
  render(<ActivityPanel data={data} />)
}

describe('ActivityPanel authoritative audit details', () => {
  afterEach(cleanup)

  it('renders insert/delete snapshots and update before/after values as text', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: '감사 이력' }))

    const inserted = screen.getByText(/announcement inserted/).closest('article')!
    await user.click(within(inserted).getByText('업무 snapshot 보기'))
    expect(within(inserted).getByText('생성 당시 업무 본문')).toBeInTheDocument()
    expect(within(inserted).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(inserted.querySelector('img')).toBeNull()

    const updated = screen.getByText(/project updated/).closest('article')!
    await user.click(within(updated).getByText('필드별 변경 보기'))
    expect(within(updated).getByText('이전 프로젝트')).toBeInTheDocument()
    expect(within(updated).getByText('이후 프로젝트')).toBeInTheDocument()

    const deleted = screen.getByText(/profile_note deleted/).closest('article')!
    await user.click(within(deleted).getByText('업무 snapshot 보기'))
    expect(within(deleted).getByText('삭제 직전 메모')).toBeInTheDocument()
  })

  it('labels legacy ID-only lifecycle events and never renders credential-like fields', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: '감사 이력' }))

    const legacy = screen.getByText(/product deleted/).closest('article')!
    expect(within(legacy).getByText('이전 감사 형식 — 상세 snapshot 없음')).toBeInTheDocument()
    expect(screen.queryByText('must-never-render')).not.toBeInTheDocument()
    expect(screen.queryByText('also-must-never-render')).not.toBeInTheDocument()
    expect(screen.queryByText('password')).not.toBeInTheDocument()
    expect(screen.queryByText('access_token')).not.toBeInTheDocument()
    expect(screen.getByText('must_change_password')).toBeInTheDocument()
  })

  it('includes safe snapshot values in audit search', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: '감사 이력' }))
    await user.type(screen.getByRole('textbox'), '생성 당시 업무 본문')

    expect(screen.getByText(/announcement inserted/)).toBeInTheDocument()
    expect(screen.queryByText(/project updated/)).not.toBeInTheDocument()
  })
})
