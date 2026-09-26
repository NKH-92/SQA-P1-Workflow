import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MutateFn } from '../app/types'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import { formatDateTime } from '../lib/format'
import type { AppData, Profile } from '../types'
import { AnnouncementsPanel } from './AnnouncementsPanel'

const announcementApi = vi.hoisted(() => ({
  save: vi.fn(async (..._args: unknown[]) => undefined),
  togglePin: vi.fn(async () => undefined),
  delete: vi.fn(async () => undefined),
}))

vi.mock('../data', () => ({
  createRepositoryContext: (profile: unknown, data: unknown, setData: unknown) => ({
    isRemote: false,
    profile,
    data,
    setData,
  }),
  saveAnnouncement: announcementApi.save,
  toggleAnnouncementPin: announcementApi.togglePin,
  deleteAnnouncement: announcementApi.delete,
}))

const announcements: AppData['announcements'] = [
  {
    id: 'notice-regular',
    title: '일반 공지',
    body: '일반 공지 본문입니다.',
    is_pinned: false,
    pinned_at: null,
    created_by: previewLeader.id,
    created_at: '2026-07-17T09:00:00.000Z',
    updated_at: '2026-07-17T09:00:00.000Z',
  },
  {
    id: 'notice-pinned',
    title: '고정 공지',
    body: '항상 먼저 보여야 하는 공지입니다.',
    is_pinned: true,
    pinned_at: '2026-07-15T09:00:00.000Z',
    created_by: previewLeader.id,
    created_at: '2026-07-15T09:00:00.000Z',
    updated_at: '2026-07-15T09:00:00.000Z',
  },
]

function testData(): AppData {
  return {
    ...createPreviewData(),
    announcements,
  }
}

const mutate: MutateFn = async (operation) => {
  await operation()
  return true
}

function renderPanel({
  leader = false,
  profile,
  initialSelectedId,
  onInitialSelectionApplied,
}: {
  leader?: boolean
  profile?: Profile
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
} = {}) {
  const data = testData()
  render(
    <AnnouncementsPanel
      data={data}
      initialSelectedId={initialSelectedId}
      mutate={mutate}
      onInitialSelectionApplied={onInitialSelectionApplied}
      profile={profile ?? (leader ? previewLeader : previewMember)}
      setData={vi.fn()}
    />,
  )
  return data
}

/** setData가 실제로 목록을 바꾸는 하네스(새 공지 선택 확인용). */
function StatefulPanel() {
  const [data, setData] = useState<AppData>(testData)
  return <AnnouncementsPanel data={data} mutate={mutate} profile={previewLeader} setData={setData} />
}

function expectNoWriteControls() {
  expect(screen.queryByRole('button', { name: '새 공지' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /더보기/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
}

describe('AnnouncementsPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    // 검색어는 세션 동안 기억되므로 테스트마다 비운다.
    window.sessionStorage.clear()
  })

  it('shows pinned announcements first and keeps controls hidden from members', async () => {
    renderPanel()

    const list = screen.getByLabelText('공지 목록')
    const announcementButtons = within(list).getAllByRole('button')
    expect(announcementButtons[0]).toHaveTextContent('고정 공지')
    expect(announcementButtons[1]).toHaveTextContent('일반 공지')

    expect(await screen.findByRole('heading', { name: '고정 공지' })).toBeInTheDocument()
    expect(within(screen.getByRole('article')).getByText(previewLeader.name)).toBeInTheDocument()
    expectNoWriteControls()
    // 파트원도 공유 링크는 복사할 수 있다.
    expect(screen.getByRole('button', { name: '링크 복사' })).toBeInTheDocument()
  })

  it('formats notice times with the shared date-time formatter', async () => {
    renderPanel()

    await screen.findByRole('heading', { name: '고정 공지' })
    const list = screen.getByLabelText('공지 목록')
    expect(within(list).getByText(formatDateTime('2026-07-17T09:00:00.000Z'))).toBeInTheDocument()
  })

  it('keeps announcement details readable but hides write controls from an inactive leader', async () => {
    renderPanel({ profile: { ...previewLeader, is_active: false } })

    expect(await screen.findByRole('heading', { name: '고정 공지' })).toBeInTheDocument()
    expect(within(screen.getByRole('article')).getByText('항상 먼저 보여야 하는 공지입니다.')).toBeInTheDocument()
    expectNoWriteControls()
  })

  it('keeps announcement details readable but hides write controls from a password-change-pending leader', async () => {
    renderPanel({ profile: { ...previewLeader, must_change_password: true } })

    expect(await screen.findByRole('heading', { name: '고정 공지' })).toBeInTheDocument()
    expect(within(screen.getByRole('article')).getByText('항상 먼저 보여야 하는 공지입니다.')).toBeInTheDocument()
    expectNoWriteControls()
  })

  it('filters by title or body and selects the first visible result', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByRole('textbox', { name: '공지 검색' }), '일반')

    const list = screen.getByLabelText('공지 목록')
    expect(within(list).queryByText('고정 공지')).not.toBeInTheDocument()
    expect(within(list).getByText('일반 공지')).toBeInTheDocument()
    expect(await screen.findByRole('heading', { name: '일반 공지' })).toBeInTheDocument()
  })

  it('explains an empty search and offers to clear it', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.type(screen.getByRole('textbox', { name: '공지 검색' }), '없는 공지')
    expect(screen.getByText('검색 결과가 없어요')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '검색어 지우기' }))
    expect(screen.getByRole('textbox', { name: '공지 검색' })).toHaveValue('')
    expect(within(screen.getByLabelText('공지 목록')).getByText('고정 공지')).toBeInTheDocument()
  })

  it('applies an announcement detail deep link', async () => {
    const onApplied = vi.fn()
    renderPanel({
      initialSelectedId: 'notice-regular',
      onInitialSelectionApplied: onApplied,
    })

    expect(await screen.findByRole('heading', { name: '일반 공지' })).toBeInTheDocument()
    expect(onApplied).toHaveBeenCalledTimes(1)
  })

  it('lets a leader create a pinned announcement', async () => {
    const user = userEvent.setup()
    const data = renderPanel({ leader: true })

    await user.click(screen.getByRole('button', { name: '새 공지' }))
    const titleInput = screen.getByRole('textbox', { name: '제목' })
    await waitFor(() => expect(titleInput).toHaveFocus())
    await user.type(titleInput, '신규 공지')
    await user.type(screen.getByRole('textbox', { name: '내용' }), '신규 공지 내용')
    await user.click(screen.getByRole('checkbox', { name: /상단에 고정/ }))
    await user.click(screen.getByRole('button', { name: '공지 올리기' }))

    expect(announcementApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ profile: previewLeader, data }),
      {
        editingAnnouncementId: null,
        expectedUpdatedAt: null,
        payload: {
          title: '신규 공지',
          body: '신규 공지 내용',
          is_pinned: true,
        },
      },
    )
  })

  it('shows inline errors instead of saving an empty notice', async () => {
    const user = userEvent.setup()
    renderPanel({ leader: true })

    await user.click(screen.getByRole('button', { name: '새 공지' }))
    await user.click(screen.getByRole('button', { name: '공지 올리기' }))

    const titleInput = screen.getByRole('textbox', { name: '제목' })
    expect(screen.getByText('제목을 입력해 주세요')).toBeInTheDocument()
    expect(titleInput).toHaveAttribute('aria-invalid', 'true')
    expect(titleInput).toHaveAccessibleDescription('제목을 입력해 주세요')
    expect(titleInput).toHaveFocus()
    expect(announcementApi.save).not.toHaveBeenCalled()
  })

  it('asks before discarding a typed notice from any close control', async () => {
    const user = userEvent.setup()
    renderPanel({ leader: true })

    await user.click(screen.getByRole('button', { name: '새 공지' }))
    await user.type(screen.getByRole('textbox', { name: '제목' }), '쓰다 만 공지')

    const dialog = screen.getByRole('dialog', { name: '새 공지 작성' })
    await user.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(within(dialog).getByText(/작성 중인 내용이 있어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '계속 쓰기' }))
    expect(screen.getByRole('textbox', { name: '제목' })).toHaveValue('쓰다 만 공지')

    await user.keyboard('{Escape}')
    expect(within(dialog).getByText(/작성 중인 내용이 있어요/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: '버리고 닫기' }))
    expect(screen.queryByRole('dialog', { name: '새 공지 작성' })).not.toBeInTheDocument()
  })

  it('selects the notice that was just posted', async () => {
    const user = userEvent.setup()
    announcementApi.save.mockImplementationOnce(async (...args: unknown[]) => {
      const ctx = args[0] as { setData: (update: (current: AppData) => AppData) => void }
      ctx.setData((current) => ({
        ...current,
        announcements: [
          ...current.announcements,
          {
            id: 'notice-new',
            title: '방금 올린 공지',
            body: '새 공지 본문',
            is_pinned: false,
            pinned_at: null,
            created_by: previewLeader.id,
            created_at: '2026-07-18T09:00:00.000Z',
            updated_at: '2026-07-18T09:00:00.000Z',
          },
        ],
      }))
    })
    render(<StatefulPanel />)
    expect(await screen.findByRole('heading', { name: '고정 공지' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '새 공지' }))
    await user.type(screen.getByRole('textbox', { name: '제목' }), '방금 올린 공지')
    await user.type(screen.getByRole('textbox', { name: '내용' }), '새 공지 본문')
    await user.click(screen.getByRole('button', { name: '공지 올리기' }))

    expect(await screen.findByRole('heading', { name: '방금 올린 공지' })).toBeInTheDocument()
  })

  it('lets a leader edit, unpin, and delete the selected announcement', async () => {
    const user = userEvent.setup()
    const data = renderPanel({ leader: true })
    await screen.findByRole('heading', { name: '고정 공지' })

    await user.click(screen.getByRole('button', { name: '수정' }))
    const titleInput = screen.getByRole('textbox', { name: '제목' })
    await user.clear(titleInput)
    await user.type(titleInput, '수정 공지')
    await user.click(screen.getByRole('button', { name: '저장하기' }))

    expect(announcementApi.save).toHaveBeenCalledWith(
      expect.objectContaining({ profile: previewLeader, data }),
      {
        editingAnnouncementId: 'notice-pinned',
        expectedUpdatedAt: '2026-07-15T09:00:00.000Z',
        payload: {
          title: '수정 공지',
          body: '항상 먼저 보여야 하는 공지입니다.',
          is_pinned: true,
        },
      },
    )

    await user.click(screen.getByRole('button', { name: '고정 공지 더보기' }))
    await user.click(screen.getByRole('menuitem', { name: '고정 풀기' }))
    expect(announcementApi.togglePin).toHaveBeenCalledWith(
      expect.objectContaining({ profile: previewLeader, data }),
      announcements[1],
    )

    await user.click(screen.getByRole('button', { name: '고정 공지 더보기' }))
    await user.click(screen.getByRole('menuitem', { name: '삭제' }))
    const confirm = screen.getByRole('dialog', { name: '‘고정 공지’를 삭제할까요?' })
    await waitFor(() => expect(within(confirm).getByRole('button', { name: '닫기' })).toHaveFocus())
    await user.click(within(confirm).getByRole('button', { name: '삭제하기' }))
    await waitFor(() =>
      expect(announcementApi.delete).toHaveBeenCalledWith(
        expect.objectContaining({ profile: previewLeader, data }),
        announcements[1],
      ),
    )
  })
})
