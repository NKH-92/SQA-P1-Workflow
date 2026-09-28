import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppData, MemberPresence, OfficeMeeting } from '../../types'

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (error: unknown) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, () => void>()
  const channel = {
    on: vi.fn((_event: string, filter: { table: string }, handler: () => void) => {
      handlers.set(filter.table, handler)
      return channel
    }),
    subscribe: vi.fn(() => channel),
  }
  return {
    handlers,
    channel,
    fetchOfficeMeeting: vi.fn(),
    fetchMemberPresence: vi.fn(),
    supabase: { channel: vi.fn(() => channel), removeChannel: vi.fn(async () => undefined) },
  }
})

vi.mock('../../lib/supabase', () => ({ supabase: mocks.supabase }))
vi.mock('../../data', () => ({
  fetchOfficeMeeting: mocks.fetchOfficeMeeting,
  fetchMemberPresence: mocks.fetchMemberPresence,
}))

import { useOfficeLiveSync } from './useOfficeLiveSync'

const presence = { statuses: [], leaves: [] } as unknown as MemberPresence
const meeting = { id: 'meeting-1', title: '회의', participants: [] } as unknown as OfficeMeeting

/** setData에 넘어온 업데이터를 실제 상태에 적용해, 새 객체가 만들어졌는지(다시 그리는지) 본다. */
function renderSync(initial: Partial<AppData>) {
  let state = initial as AppData
  const changes: AppData[] = []
  const setData = vi.fn((update: AppData | ((current: AppData) => AppData)) => {
    const next = typeof update === 'function' ? update(state) : update
    if (next !== state) changes.push(next)
    state = next
  })
  const view = renderHook(() => useOfficeLiveSync(true, setData))
  return { ...view, setData, changes, current: () => state }
}

async function flush() {
  await act(async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve()
  })
}

describe('useOfficeLiveSync', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.handlers.clear()
    mocks.fetchOfficeMeeting.mockReset()
    mocks.fetchMemberPresence.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the same data object when the 30-second check finds nothing new, and applies both parts at once', async () => {
    mocks.fetchOfficeMeeting.mockResolvedValue(null)
    mocks.fetchMemberPresence.mockResolvedValue({ ...presence })
    const sync = renderSync({ officeMeeting: null, memberPresence: presence })

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    await flush()
    expect(mocks.fetchOfficeMeeting).toHaveBeenCalledTimes(1)
    expect(mocks.fetchMemberPresence).toHaveBeenCalledTimes(1)
    expect(sync.changes).toHaveLength(0)

    const nextPresence = { statuses: [{ profile_id: 'member-a', status: 'away' }], leaves: [] } as unknown as MemberPresence
    mocks.fetchOfficeMeeting.mockResolvedValue(meeting)
    mocks.fetchMemberPresence.mockResolvedValue(nextPresence)
    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    await flush()
    // 회의와 자리 상태가 모두 바뀌어도 한 번만 반영한다.
    expect(sync.changes).toHaveLength(1)
    expect(sync.current().officeMeeting).toEqual(meeting)
    expect(sync.current().memberPresence).toEqual(nextPresence)
    sync.unmount()
  })

  it('reads once more after finishing when a change arrives while a read is in flight', async () => {
    const first = deferred<OfficeMeeting | null>()
    mocks.fetchOfficeMeeting.mockReturnValueOnce(first.promise).mockResolvedValueOnce(meeting)
    const sync = renderSync({ officeMeeting: null, memberPresence: presence })

    act(() => mocks.handlers.get('office_meetings')!())
    act(() => mocks.handlers.get('office_meeting_participants')!())
    act(() => mocks.handlers.get('office_meetings')!())
    expect(mocks.fetchOfficeMeeting).toHaveBeenCalledTimes(1)

    // 첫 읽기는 확인 전 상태를 읽었다.
    first.resolve(null)
    await flush()
    // 읽는 동안 온 변화는 한 번으로 모아 다시 읽는다.
    expect(mocks.fetchOfficeMeeting).toHaveBeenCalledTimes(2)
    expect(sync.current().officeMeeting).toEqual(meeting)
    expect(mocks.fetchMemberPresence).not.toHaveBeenCalled()
    sync.unmount()
  })

  it('does not read again after the screen is gone', async () => {
    const first = deferred<OfficeMeeting | null>()
    mocks.fetchOfficeMeeting.mockReturnValueOnce(first.promise)
    const sync = renderSync({ officeMeeting: null, memberPresence: presence })

    act(() => mocks.handlers.get('office_meetings')!())
    act(() => mocks.handlers.get('office_meetings')!())
    sync.unmount()
    first.resolve(meeting)
    await flush()
    expect(mocks.fetchOfficeMeeting).toHaveBeenCalledTimes(1)
    expect(sync.changes).toHaveLength(0)
  })

  it('still applies the part that loaded when the other one fails', async () => {
    mocks.fetchOfficeMeeting.mockRejectedValue(new Error('network down'))
    const nextPresence = { statuses: [{ profile_id: 'member-a', status: 'away' }], leaves: [] } as unknown as MemberPresence
    mocks.fetchMemberPresence.mockResolvedValue(nextPresence)
    const sync = renderSync({ officeMeeting: meeting, memberPresence: presence })

    act(() => {
      vi.advanceTimersByTime(30_000)
    })
    await flush()
    expect(sync.current().officeMeeting).toBe(meeting)
    expect(sync.current().memberPresence).toEqual(nextPresence)
    sync.unmount()
  })
})
