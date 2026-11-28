import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../test/deferred'
import { useRealtimeReviewInserts } from './useRealtimeReviewInserts'

type ChannelRecord = {
  name: string
  subscriptions: Array<{
    args: [string, Record<string, string>]
    handler: () => void
  }>
  statusCallback: ((status: string) => void) | null
}

const state = vi.hoisted(() => ({
  channels: [] as ChannelRecord[],
  removeChannel: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel(name: string) {
      const record: ChannelRecord = { name, subscriptions: [], statusCallback: null }
      state.channels.push(record)
      const builder = {
        on(type: string, filter: Record<string, string>, handler: () => void) {
          record.subscriptions.push({ args: [type, filter], handler })
          return builder
        },
        subscribe(callback?: (status: string) => void) {
          record.statusCallback = callback ?? null
          callback?.('SUBSCRIBED')
          return builder
        },
      }
      return builder
    },
    removeChannel: state.removeChannel,
  },
}))

afterEach(() => {
  state.channels.length = 0
  state.removeChannel.mockClear()
})

describe('useRealtimeReviewInserts', () => {
  it('subscribes to review_requests INSERT and UPDATE events when enabled', () => {
    const onChange = vi.fn()
    renderHook(() => useRealtimeReviewInserts(true, onChange))

    expect(state.channels).toHaveLength(1)
    expect(state.channels[0].name).toBe('review-requests-changes')
    expect(state.channels[0].subscriptions.map((item) => item.args)).toEqual([
      ['postgres_changes', { event: 'INSERT', schema: 'public', table: 'review_requests' }],
      ['postgres_changes', { event: 'UPDATE', schema: 'public', table: 'review_requests' }],
    ])
    // 최초 SUBSCRIBED만으로는 재조회하지 않는다 (초기 로드가 이미 최신).
    expect(onChange).not.toHaveBeenCalled()
  })

  it('does not subscribe when disabled', () => {
    renderHook(() => useRealtimeReviewInserts(false, vi.fn()))

    expect(state.channels).toHaveLength(0)
  })

  it('queues one follow-up fetch for a burst of INSERT and UPDATE events', async () => {
    const first = deferred<void>()
    const onChange = vi.fn(async () => {}).mockReturnValueOnce(first.promise)
    renderHook(() => useRealtimeReviewInserts(true, onChange))

    state.channels[0].subscriptions[0]?.handler()
    for (let event = 0; event < 20; event += 1) state.channels[0].subscriptions[1]?.handler()
    expect(onChange).toHaveBeenCalledTimes(1)

    first.resolve()
    await first.promise
    expect(onChange).toHaveBeenCalledTimes(2)
  })

  it('refetches once after a disconnect-reconnect cycle to fill the gap', () => {
    const onInsert = vi.fn()
    renderHook(() => useRealtimeReviewInserts(true, onInsert))

    state.channels[0].statusCallback?.('CHANNEL_ERROR')
    expect(onInsert).not.toHaveBeenCalled()

    state.channels[0].statusCallback?.('SUBSCRIBED')
    expect(onInsert).toHaveBeenCalledTimes(1)

    // 안정 연결 중 반복되는 SUBSCRIBED는 추가 재조회를 만들지 않는다.
    state.channels[0].statusCallback?.('SUBSCRIBED')
    expect(onInsert).toHaveBeenCalledTimes(1)
  })

  it('uses the latest callback after rerenders', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ onInsert }) => useRealtimeReviewInserts(true, onInsert), {
      initialProps: { onInsert: first },
    })

    rerender({ onInsert: second })
    state.channels[0].subscriptions[0]?.handler()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    // 콜백 교체가 재구독을 만들지 않는다.
    expect(state.channels).toHaveLength(1)
  })

  it('removes the channel and drops pending refreshes on unmount', async () => {
    const first = deferred<void>()
    const onChange = vi.fn(() => first.promise)
    const { unmount } = renderHook(() => useRealtimeReviewInserts(true, onChange))
    const [insert, update] = state.channels[0].subscriptions
    insert.handler()
    update.handler()

    unmount()
    first.resolve()
    await first.promise
    update.handler()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(state.removeChannel).toHaveBeenCalledTimes(1)
  })
})
