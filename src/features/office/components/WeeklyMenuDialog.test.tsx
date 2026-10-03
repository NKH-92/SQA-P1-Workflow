import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { previewMember, previewLeader } from '../../../demoData'
import { loadWeeklyMenu, publishWeeklyMenu } from '../../../data/repositories/weeklyMenuRepository'
import { inspectMenuImage } from '../../../data/validation/weeklyMenu'
import { WeeklyMenuDialog } from './WeeklyMenuDialog'

vi.mock('../../../data/repositories/weeklyMenuRepository', () => ({ loadWeeklyMenu: vi.fn(), publishWeeklyMenu: vi.fn() }))
vi.mock('../../../data/validation/weeklyMenu', async (original) => ({ ...await original<object>(), inspectMenuImage: vi.fn() }))

beforeEach(() => {
  vi.mocked(loadWeeklyMenu).mockResolvedValue(null)
  vi.mocked(inspectMenuImage).mockResolvedValue({ width: 400, height: 1600 })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('WeeklyMenuDialog', () => {
  it('accepts a pasted capture while the initial close button has focus', async () => {
    render(<WeeklyMenuDialog profile={previewMember} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('메뉴 사진 선택')).toBeEnabled())
    const file = new File(['png'], 'clipboard.png', { type: 'image/png' })
    fireEvent.paste(screen.getByRole('button', { name: '메뉴판 닫기' }), { clipboardData: { files: [file] } })
    await screen.findByText('게시 전 미리보기 · 400 × 1600')
    expect(inspectMenuImage).toHaveBeenCalledWith(file)
  })
  it.each([previewMember, { ...previewLeader, role: 'team_leader' as const }])('lets $role preview and publish a screenshot', async (profile) => {
    const file = new File(['png'], 'menu.png', { type: 'image/png' })
    vi.mocked(publishWeeklyMenu).mockResolvedValue({ image: file, uploadedAt: '2026-10-03T00:00:00Z' })
    render(<WeeklyMenuDialog profile={profile} onClose={vi.fn()} />)
    const input = screen.getByLabelText('메뉴 사진 선택')
    await waitFor(() => expect(input).toBeEnabled())
    fireEvent.change(input, { target: { files: [file] } })
    await screen.findByText('게시 전 미리보기 · 400 × 1600')
    expect(publishWeeklyMenu).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '확대 보기' }))
    expect(screen.getByRole('button', { name: '전체 보기' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: '이번 주 메뉴로 게시' }))
    await waitFor(() => expect(publishWeeklyMenu).toHaveBeenCalledWith(expect.any(String), file))
    await screen.findByText('게시된 메뉴')
    expect(screen.getByRole('button', { name: '메뉴 사진 바꾸기' })).toBeEnabled()
  })

  it('preserves the selected photo when publication fails and permits retry', async () => {
    vi.mocked(publishWeeklyMenu).mockRejectedValue(new Error('연결 오류'))
    render(<WeeklyMenuDialog profile={previewMember} onClose={vi.fn()} />)
    await waitFor(() => expect(screen.getByLabelText('메뉴 사진 선택')).toBeEnabled())
    fireEvent.change(screen.getByLabelText('메뉴 사진 선택'), { target: { files: [new File(['png'], 'menu.png', { type: 'image/png' })] } })
    await screen.findByText('게시 전 미리보기 · 400 × 1600')
    fireEvent.click(screen.getByRole('button', { name: '이번 주 메뉴로 게시' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('연결 오류')
    expect(screen.getByText('게시 전 미리보기 · 400 × 1600')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '이번 주 메뉴로 게시' })).toBeEnabled()
  })

  it('does not disguise a failed read as an empty menu', async () => {
    vi.mocked(loadWeeklyMenu).mockRejectedValue(new Error('조회 오류'))
    render(<WeeklyMenuDialog profile={previewMember} onClose={vi.fn()} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('조회 오류')
    expect(screen.queryByText('이번 주 메뉴를 기다리고 있어요')).not.toBeInTheDocument()
    vi.mocked(loadWeeklyMenu).mockResolvedValue(null)
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByText('이번 주 메뉴를 기다리고 있어요')
  })
})
