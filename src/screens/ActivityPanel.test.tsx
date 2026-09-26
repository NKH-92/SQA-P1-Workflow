import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { createPreviewData } from '../demoData'
import type { AppData, AuditEvent } from '../types'
import { ActivityPanel } from './ActivityPanel'

const events: AuditEvent[] = [
  {
    id: '5',
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
    id: '4',
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
    id: '3',
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
    id: '2',
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
    id: '1',
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

function renderPanel(overrides: Partial<AppData> = {}) {
  const data: AppData = { ...createPreviewData(), auditEvents: events, ...overrides }
  render(<ActivityPanel data={data} />)
}

describe('ActivityPanel authoritative audit details', () => {
  afterEach(() => {
    cleanup()
    // 탭·검색어는 세션 동안 기억되므로 테스트마다 비운다.
    window.sessionStorage.clear()
  })

  it('matches the sidebar name and explains the recent-100 limit without system names', () => {
    renderPanel()

    expect(screen.getByRole('heading', { level: 1, name: '활동 로그' })).toBeInTheDocument()
    const note = screen.getByText(/최근 100건까지 보여요/)
    expect(note).toHaveAttribute('role', 'note')
    expect(note).toHaveTextContent('더 오래된 기록이 필요하면 관리자에게 요청해 주세요.')
    expect(document.body.textContent).not.toMatch(/Supabase|Dashboard|snapshot/)
  })

  it('shows stored 합니다체 summaries in 해요체 and never shows raw codes', () => {
    renderPanel()

    expect(screen.getByText('파트원 A님이 파트너 API 전환 검토를 요청했어요.')).toBeInTheDocument()
    expect(screen.getByText('미리보기 파트장님이 정산 자동화 화면 문구 확인에 피드백을 남겼어요.')).toBeInTheDocument()
    expect(screen.queryByText(/했습니다|남겼습니다/)).not.toBeInTheDocument()
    expect(screen.getAllByText('검토요청').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toMatch(/review_request|project_assignment|review_feedback|\bcreated\b|\bassigned\b/)
  })

  it('renders insert/delete values and update before/after values as text', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: '변경 기록' }))

    const inserted = screen.getByText('파트장 · 공지 등록').closest('article')!
    await user.click(within(inserted).getByText('저장된 값 보기'))
    expect(within(inserted).getByText('생성 당시 업무 본문')).toBeInTheDocument()
    expect(within(inserted).getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(inserted.querySelector('img')).toBeNull()

    const updated = screen.getByText('파트장 · 프로젝트 수정').closest('article')!
    await user.click(within(updated).getByText('바뀐 항목 보기'))
    expect(within(updated).getByText('이전 프로젝트')).toBeInTheDocument()
    expect(within(updated).getByText('이후 프로젝트')).toBeInTheDocument()
    expect(within(updated).getByText(/사유: 명칭 정리/)).toBeInTheDocument()

    const deleted = screen.getByText('파트장 · 관리 메모 삭제').closest('article')!
    await user.click(within(deleted).getByText('저장된 값 보기'))
    expect(within(deleted).getByText('삭제 직전 메모')).toBeInTheDocument()
  })

  it('labels legacy ID-only lifecycle events and never renders credential-like fields', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: '변경 기록' }))

    const legacy = screen.getByText('시스템 · 제품 삭제').closest('article')!
    expect(within(legacy).getByText('이전 방식으로 남은 기록이라 자세한 내용이 없어요')).toBeInTheDocument()
    expect(screen.queryByText('must-never-render')).not.toBeInTheDocument()
    expect(screen.queryByText('also-must-never-render')).not.toBeInTheDocument()
    expect(screen.queryByText('password')).not.toBeInTheDocument()
    expect(screen.queryByText('access_token')).not.toBeInTheDocument()
    expect(screen.getByText('비밀번호 변경 필요')).toBeInTheDocument()
    expect(screen.getByText('이전 방식 기록')).toBeInTheDocument()
  })

  it('includes safe snapshot values in audit search', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: '변경 기록' }))
    await user.type(screen.getByRole('textbox', { name: '활동 로그 검색' }), '생성 당시 업무 본문')

    expect(screen.getByText('파트장 · 공지 등록')).toBeInTheDocument()
    expect(screen.queryByText('파트장 · 프로젝트 수정')).not.toBeInTheDocument()
  })

  it('explains an empty search and offers to clear it', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(screen.getByRole('textbox', { name: '활동 로그 검색' }), '없는 기록')

    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '검색어 지우기' }))
    expect(screen.getByRole('textbox', { name: '활동 로그 검색' })).toHaveValue('')
  })
})
