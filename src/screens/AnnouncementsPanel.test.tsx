import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { MutateFn } from '../app/types'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import type { AppData, Profile } from '../types'
import { AnnouncementsPanel } from './AnnouncementsPanel'

const announcementApi = vi.hoisted(() => ({
  save: vi.fn(async () => undefined),
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

function expectNoWriteControls() {
  expect(screen.queryByRole('button', { name: '새 공지' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '상단 고정' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '고정 해제' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
}

describe('AnnouncementsPanel', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('shows pinned announcements first and keeps controls hidden from members', async () => {
    renderPanel()

    const list = screen.getByLabelText('공지 목록')
    const announcementButtons = within(list).getAllByRole('button')
    expect(announcementButtons[0]).toHaveTextContent('고정 공지')
    expect(announcementButtons[1]).toHaveTextContent('일반 공지')

    expect(await screen.findByRole('heading', { name: '고정 공지' })).toBeInTheDocument()
    expect(within(screen.getByRole('article')).getByText(previewLeader.name)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '새 공지' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '수정' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '고정 해제' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '삭제' })).not.toBeInTheDocument()
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
    await user.type(screen.getByRole('textbox', { name: '제목' }), '신규 공지')
    await user.type(screen.getByRole('textbox', { name: '내용' }), '신규 공지 내용')
    await user.click(screen.getByRole('checkbox', { name: /상단에 고정/ }))
    await user.click(screen.getByRole('button', { name: '공지 등록' }))

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

  it('lets a leader edit, unpin, and delete the selected announcement', async () => {
    const user = userEvent.setup()
    const data = renderPanel({ leader: true })
    await screen.findByRole('heading', { name: '고정 공지' })

    await user.click(screen.getByRole('button', { name: '수정' }))
    const titleInput = screen.getByRole('textbox', { name: '제목' })
    await user.clear(titleInput)
    await user.type(titleInput, '수정 공지')
    await user.click(screen.getByRole('button', { name: '공지 수정' }))

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

    await user.click(screen.getByRole('button', { name: '고정 해제' }))
    expect(announcementApi.togglePin).toHaveBeenCalledWith(
      expect.objectContaining({ profile: previewLeader, data }),
      announcements[1],
    )

    await user.click(screen.getByRole('button', { name: '삭제' }))
    await user.click(screen.getByRole('button', { name: '삭제 확인' }))
    await waitFor(() =>
      expect(announcementApi.delete).toHaveBeenCalledWith(
        expect.objectContaining({ profile: previewLeader, data }),
        announcements[1],
      ),
    )
  })
})
