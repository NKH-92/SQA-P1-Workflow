import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MutateFn, TabId } from '../app/types'
import { createPreviewData, previewLeader, previewMember } from '../demoData'
import type { AppData, Profile } from '../types'
import { OfficeHome } from './OfficeHome'

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  // 넓은 화면처럼 ‘오늘 할 일’ 창을 펼친 채로 시작한다.
  window.localStorage.setItem('ui:office-quest-collapsed', '0')
})

afterEach(() => {
  cleanup()
  window.localStorage.clear()
})

function Harness({ profile, leaderMode, setActiveTab = vi.fn(), toasts = [] }: {
  profile: Profile
  leaderMode: boolean
  setActiveTab?: (tab: TabId, entityId?: string) => void
  toasts?: string[]
}) {
  const [data, setData] = useState<AppData>(createPreviewData)
  const mutate: MutateFn = async (operation, success) => {
    try {
      await operation()
    } catch (error) {
      toasts.push(`error:${(error as Error).message}`)
      return false
    }
    const spec = typeof success === 'function' ? success() : success
    toasts.push(typeof spec === 'string' ? spec : spec.text)
    return true
  }
  return <OfficeHome data={data} leaderMode={leaderMode} mutate={mutate} profile={profile} setActiveTab={setActiveTab} setData={setData} />
}

describe('OfficeHome', () => {
  it('fills the home with the whole office, including the objects added for every menu', () => {
    render(<Harness leaderMode profile={previewLeader} />)
    expect(screen.getByRole('heading', { level: 1, name: '우리 파트 사무실' })).toBeInTheDocument()
    const objects = within(screen.getByRole('group', { name: '사무실 바로가기' })).getAllByRole('button')
    const names = objects.map((button) => button.getAttribute('aria-label') ?? '')
    for (const expected of [/^명패 보드, .*파트원으로 이동$/, /^검토 통계 모니터, 검토 통계로 이동$/, /^출입 게이트, 계정 관리로 이동$/,
      /^출입 기록부, 활동 로그로 이동$/, /^제품 샘플 보관장, .*제품으로 이동$/, /^업무 분장표, 업무 카테고리로 이동$/, /^회의실, 회의 열기$/]) {
      expect(names.some((name) => expected.test(name)), String(expected)).toBe(true)
    }
  })

  it('opens each new object’s screen', () => {
    const setActiveTab = vi.fn()
    render(<Harness leaderMode profile={previewLeader} setActiveTab={setActiveTab} />)
    const objects = within(screen.getByRole('group', { name: '사무실 바로가기' }))
    fireEvent.click(objects.getByRole('button', { name: '검토 통계 모니터, 검토 통계로 이동' }))
    fireEvent.click(objects.getByRole('button', { name: '출입 게이트, 계정 관리로 이동' }))
    fireEvent.click(objects.getByRole('button', { name: '출입 기록부, 활동 로그로 이동' }))
    fireEvent.click(objects.getByRole('button', { name: '업무 분장표, 업무 카테고리로 이동' }))
    expect(setActiveTab.mock.calls).toEqual([['review-stats'], ['invites'], ['activity'], ['duties']])
  })

  it('lists the most urgent work as quests and opens them', () => {
    const setActiveTab = vi.fn()
    render(<Harness leaderMode profile={previewLeader} setActiveTab={setActiveTab} />)
    const quests = screen.getByRole('complementary', { name: /오늘 처리할 일 \d+건/ })
    const items = within(quests).getAllByRole('listitem')
    expect(items).toHaveLength(5)
    fireEvent.click(within(items[0]).getByRole('button'))
    expect(setActiveTab).toHaveBeenCalledTimes(1)
    fireEvent.click(within(quests).getByRole('button', { name: /^나머지 \d+건 보기$/ }))
    expect(within(quests).getAllByRole('listitem').length).toBeGreaterThan(5)
  })

  it('shows a member only the objects for screens in their menu and the review request button', () => {
    render(<Harness leaderMode={false} profile={previewMember} />)
    const names = within(screen.getByRole('group', { name: '사무실 바로가기' })).getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? '')
    expect(names.some((name) => name.startsWith('검토 통계'))).toBe(false)
    expect(names.some((name) => name.startsWith('출입 게이트'))).toBe(false)
    expect(names.some((name) => name.startsWith('회의실'))).toBe(true)
    expect(screen.getByRole('button', { name: '검토요청 쓰기' })).toBeInTheDocument()
  })

  it('remembers a collapsed quest panel', () => {
    const { unmount } = render(<Harness leaderMode profile={previewLeader} />)
    fireEvent.click(screen.getByRole('button', { name: '오늘 할 일 접기' }))
    expect(screen.getByRole('button', { name: /^오늘 할 일 \d+건$/ })).toHaveAttribute('aria-expanded', 'false')
    unmount()
    render(<Harness leaderMode profile={previewLeader} />)
    expect(screen.getByRole('button', { name: /^오늘 할 일 \d+건$/ })).toBeInTheDocument()
  })

  it('opens the meeting room and starts a meeting for seated people', async () => {
    const toasts: string[] = []
    render(<Harness leaderMode profile={previewLeader} toasts={toasts} />)
    fireEvent.click(screen.getByRole('button', { name: '회의실, 회의 열기' }))
    const dialog = screen.getByRole('dialog', { name: '회의 열기' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /파트원 A/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '회의 시작' }))
    await waitFor(() => expect(toasts).toEqual(['회의를 열었어요. 부른 사람이 확인하면 회의실로 모여요.']))
    expect(screen.getByRole('button', { name: /^회의실, 회의 중 확인 1\/2명, 회의 보기$/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '회의 중, 확인 1/2명' })).toBeInTheDocument()
  })
})
