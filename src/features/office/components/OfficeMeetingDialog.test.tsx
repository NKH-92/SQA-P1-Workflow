import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPreviewData, previewLeader, previewMember } from '../../../demoData'
import type { OfficeMeeting } from '../../../types'
import { sceneOccupants } from '../officeLayoutModel'
import { OfficeMeetingDialog } from './OfficeMeetingDialog'

afterEach(cleanup)

const preview = createPreviewData()
const occupants = sceneOccupants(preview.officeLayout)
/** 미리보기: 파트원 B는 오늘부터 출장, 파트원 C는 실험실 */
const presence = preview.memberPresence

function openMeeting(overrides: Partial<OfficeMeeting> = {}): OfficeMeeting {
  const now = Date.now()
  return {
    id: 'meeting-1',
    title: '',
    organizer_id: previewLeader.id,
    organizer_name: previewLeader.name,
    created_at: new Date(now - 5 * 60 * 1000).toISOString(),
    starts_at: new Date(now - 5 * 60 * 1000).toISOString(),
    location: '',
    expires_at: new Date(now + 60 * 60 * 1000).toISOString(),
    participants: [
      { user_id: previewLeader.id, name: previewLeader.name, acknowledged_at: new Date(now).toISOString() },
      { user_id: previewMember.id, name: previewMember.name, acknowledged_at: null },
    ],
    ...overrides,
  }
}

function renderDialog(props: Partial<Parameters<typeof OfficeMeetingDialog>[0]> = {}) {
  const handlers = {
    onStart: vi.fn(async () => true),
    onAcknowledge: vi.fn(async () => true),
    onEnd: vi.fn(async () => true),
  }
  render(
    <OfficeMeetingDialog
      meeting={null}
      occupants={occupants}
      onClose={vi.fn()}
      presence={presence}
      profile={previewMember}
      {...handlers}
      {...props}
    />,
  )
  return handlers
}

describe('OfficeMeetingDialog', () => {
  it('opens a meeting right away in the office room with a topic and seated people other than me', async () => {
    const { onStart } = renderDialog()
    const dialog = screen.getByRole('dialog', { name: '회의 열기' })
    const start = within(dialog).getByRole('button', { name: '회의 시작' })
    expect(start).toBeDisabled()
    expect(within(dialog).getByText('부를 사람을 한 명 이상 골라 주세요.')).toBeInTheDocument()
    // 나(파트원 A)는 목록에 없다.
    expect(within(dialog).queryByRole('checkbox', { name: new RegExp(previewMember.name) })).not.toBeInTheDocument()

    fireEvent.change(within(dialog).getByRole('textbox', { name: '회의 주제(선택)' }), { target: { value: '일탈 건' } })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /파트원 C/ }))
    expect(within(dialog).getByText(/1명을 불러 지금 바로 사무실 회의실에서 해요/)).toBeInTheDocument()
    fireEvent.click(start)
    await waitFor(() => expect(onStart).toHaveBeenCalledWith({
      title: '일탈 건',
      participantIds: [expect.any(String)],
      startsAt: null,
      location: '',
    }))
  })

  it('shows a seated team leader but never lets anyone invite them', async () => {
    const teamLeader = { ...occupants[0], seatIndex: 8, profileId: 'team-1', name: '팀장 김', role: 'team_leader' as const }
    const { onStart } = renderDialog({ occupants: [...occupants, teamLeader] })
    const dialog = screen.getByRole('dialog', { name: '회의 열기' })
    const leader = within(dialog).getByRole('checkbox', { name: /팀장 김/ })
    expect(leader).toBeDisabled()
    expect(leader.closest('label')).toHaveTextContent('팀장(읽기 전용)은 부를 수 없어요')
    fireEvent.click(leader)
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /파트원 C/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: '회의 시작' }))
    const memberC = occupants.find((item) => item.name === '파트원 C')!
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(expect.objectContaining({ participantIds: [memberC.profileId] })))
  })

  it('shows each person’s status and keeps people on a trip out', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog', { name: '회의 열기' })
    const away = within(dialog).getByRole('checkbox', { name: /파트원 B/ })
    expect(away).toBeDisabled()
    expect(away.closest('label')).toHaveTextContent(/출장 · .*까지/)
    expect(within(dialog).getByRole('checkbox', { name: /파트원 C/ }).closest('label')).toHaveTextContent('실험실')
  })

  it('schedules a meeting later today somewhere else', async () => {
    const { onStart } = renderDialog({ profile: previewLeader })
    const dialog = screen.getByRole('dialog', { name: '회의 열기' })
    const later = within(dialog).getByRole('radio', { name: '오늘 시간 정하기' })
    if ((later as HTMLInputElement).disabled) return // 자정 직전이면 고를 시각이 없다.
    fireEvent.click(later)
    const time = within(dialog).getByRole('combobox', { name: '시각' }) as HTMLSelectElement
    fireEvent.click(within(dialog).getByRole('radio', { name: '다른 곳' }))
    const start = within(dialog).getByRole('button', { name: '회의 잡기' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /파트원 C/ }))
    expect(start).toBeDisabled()
    expect(within(dialog).getByText('회의할 곳을 적어 주세요.')).toBeInTheDocument()
    fireEvent.change(within(dialog).getByRole('combobox', { name: '장소 이름' }), { target: { value: '3층 대회의실' } })
    fireEvent.click(start)
    await waitFor(() => expect(onStart).toHaveBeenCalledWith(expect.objectContaining({
      location: '3층 대회의실',
      startsAt: expect.stringMatching(/T\d\d:\d0:00\.000Z$/),
    })))
    expect(time.value).toMatch(/^\d\d:\d0$/)
  })

  it('shows who confirmed and lets an invitee confirm while only the organizer or leader can end', () => {
    const { onAcknowledge } = renderDialog({ meeting: openMeeting() })
    const people = screen.getByRole('list', { name: '회의 대상자' })
    expect(within(people).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      `${previewLeader.name}연 사람확인`,
      `${previewMember.name}나확인 전`,
    ])
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' }))
    expect(onAcknowledge).toHaveBeenCalledWith('meeting-1')
    expect(screen.queryByRole('button', { name: '회의 완료' })).not.toBeInTheDocument()

    cleanup()
    renderDialog({ meeting: openMeeting(), profile: previewLeader })
    expect(screen.getByRole('button', { name: '회의 완료' })).toBeEnabled()

    // 아직 시작 전이면 ‘회의 취소’다.
    cleanup()
    renderDialog({ meeting: openMeeting({ starts_at: new Date(Date.now() + 30 * 60 * 1000).toISOString() }), profile: previewLeader })
    expect(screen.getByRole('button', { name: '회의 취소' })).toBeEnabled()
    expect(screen.getByText(/시작 예정/, { selector: '.office-meeting-when' })).toBeInTheDocument()
  })

  it('follows the office clock, so a scheduled meeting turns from cancel to done when it starts', () => {
    const startsAt = Date.now() + 30 * 60 * 1000
    const meeting = openMeeting({ starts_at: new Date(startsAt).toISOString() })
    const props = { meeting, occupants, onClose: vi.fn(), presence, profile: previewLeader, onStart: vi.fn(async () => true), onAcknowledge: vi.fn(async () => true), onEnd: vi.fn(async () => true) }
    const { rerender } = render(<OfficeMeetingDialog {...props} now={Date.now()} />)
    expect(screen.getByRole('button', { name: '회의 취소' })).toBeEnabled()

    rerender(<OfficeMeetingDialog {...props} now={startsAt + 60 * 1000} />)
    expect(screen.getByRole('button', { name: '회의 완료' })).toBeEnabled()
    expect(screen.queryByText(/시작 예정/, { selector: '.office-meeting-when' })).not.toBeInTheDocument()
  })

  it('lets team leaders look but not open a meeting', () => {
    renderDialog({ profile: { ...previewLeader, role: 'team_leader' } })
    expect(screen.getByText('팀장은 회의실을 볼 수만 있어요.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '회의 시작' })).not.toBeInTheDocument()
  })
})
