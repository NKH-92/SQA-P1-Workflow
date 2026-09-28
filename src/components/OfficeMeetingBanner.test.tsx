import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { previewLeader, previewMember } from '../demoData'
import { formatClock } from '../lib/format'
import type { OfficeMeeting } from '../types'
import { OfficeMeetingBanner } from './OfficeMeetingBanner'

afterEach(cleanup)

const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
const now = new Date().toISOString()
const meeting: OfficeMeeting = {
  id: 'meeting-1',
  title: '일탈 건 5분 논의',
  organizer_id: previewLeader.id,
  organizer_name: previewLeader.name,
  created_at: now,
  starts_at: now,
  location: '',
  expires_at: future,
  participants: [
    { user_id: previewLeader.id, name: previewLeader.name, acknowledged_at: now },
    { user_id: previewMember.id, name: previewMember.name, acknowledged_at: null },
  ],
}

function renderBanner(profile = previewMember, value: OfficeMeeting | null = meeting) {
  const onAcknowledge = vi.fn(async () => true)
  const onEnd = vi.fn(async () => true)
  render(<OfficeMeetingBanner meeting={value} onAcknowledge={onAcknowledge} onEnd={onEnd} profile={profile} />)
  return { onAcknowledge, onEnd }
}

describe('OfficeMeetingBanner', () => {
  it('asks an invitee to confirm from any screen', () => {
    const { onAcknowledge } = renderBanner()
    const banner = screen.getByRole('status')
    expect(banner).toHaveTextContent(`${previewLeader.name}님이 회의를 요청했어요`)
    expect(banner).toHaveTextContent('사무실 회의실 · 일탈 건 5분 논의')
    fireEvent.click(screen.getByRole('button', { name: '확인했어요' }))
    expect(onAcknowledge).toHaveBeenCalledWith('meeting-1')
    expect(screen.queryByRole('button', { name: '회의 완료' })).not.toBeInTheDocument()
  })

  it('shows the organizer how many confirmed and lets them end it', () => {
    const { onEnd } = renderBanner(previewLeader)
    expect(screen.getByRole('status')).toHaveTextContent('회의 중 · 사무실 회의실 · 일탈 건 5분 논의 · 확인 1/2명')
    fireEvent.click(screen.getByRole('button', { name: '회의 완료' }))
    expect(onEnd).toHaveBeenCalledWith('meeting-1')
  })

  it('announces a scheduled meeting with its time and place, and lets the organizer cancel it', () => {
    const startsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString()
    const { onEnd } = renderBanner(previewLeader, { ...meeting, starts_at: startsAt, location: '3층 대회의실' })
    expect(screen.getByRole('status')).toHaveTextContent(`${formatClock(startsAt)} 회의 예정 · ${formatClock(startsAt)} · 3층 대회의실`)
    fireEvent.click(screen.getByRole('button', { name: '회의 취소' }))
    expect(onEnd).toHaveBeenCalledWith('meeting-1')
  })

  it('shows a scheduled meeting that already started by the time it arrives as in progress', () => {
    // 배너는 앱을 띄울 때 한 번 마운트된다. 절전 중에 예약된 회의를 시작 시각이 지난 뒤에 받는 경우.
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-09-28T23:50:00.000Z'))
      const props = { onAcknowledge: vi.fn(async () => true), onEnd: vi.fn(async () => true), profile: previewLeader }
      const { rerender } = render(<OfficeMeetingBanner meeting={null} {...props} />)
      expect(screen.queryByRole('status')).not.toBeInTheDocument()

      vi.setSystemTime(new Date('2026-09-29T04:10:00.000Z'))
      rerender(
        <OfficeMeetingBanner
          meeting={{
            ...meeting,
            created_at: '2026-09-29T03:30:00.000Z',
            starts_at: '2026-09-29T04:00:00.000Z',
            expires_at: '2026-09-29T07:00:00.000Z',
          }}
          {...props}
        />,
      )
      expect(screen.getByRole('status')).toHaveTextContent('회의 중 · 사무실 회의실 · 일탈 건 5분 논의 · 확인 1/2명')
      expect(screen.getByRole('button', { name: '회의 완료' })).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: '회의 취소' })).not.toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('stays out of the way for people outside the meeting and when the room is empty', () => {
    renderBanner({ ...previewMember, id: 'member-09' })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    cleanup()
    renderBanner(previewLeader, null)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
