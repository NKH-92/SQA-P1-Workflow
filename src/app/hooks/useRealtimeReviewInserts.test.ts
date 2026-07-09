import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useRealtimeReviewInserts } from './useRealtimeReviewInserts'

type ChannelRecord = {
  name: string
  onArgs: [string, Record<string, string>] | null
  insertHandler: (() => void) | null
  statusCallback: ((status: string) => void) | null
}

const state = vi.hoisted(() => ({
  channels: [] as ChannelRecord[],
  removeChannel: vi.fn(),
}))

vi.mock('../../lib/supabase', () => ({
  supabase: {
    channel(name: string) {
      const record: ChannelRecord = { name, onArgs: null, insertHandler: null, statusCallback: null }
      state.channels.push(record)
      const builder = {
        on(type: string, filter: Record<string, string>, handler: () => void) {
          record.onArgs = [type, filter]
          record.insertHandler = handler
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
  it('subscribes to review_requests INSERT events when enabled', () => {
    const onInsert = vi.fn()
    renderHook(() => useRealtimeReviewInserts(true, onInsert))

    expect(state.channels).toHaveLength(1)
    expect(state.channels[0].name).toBe('review-requests-inserts')
    expect(state.channels[0].onArgs).toEqual([
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'review_requests' },
    ])
    // 최초 SUBSCRIBED만으로는 재조회하지 않는다 (초기 로드가 이미 최신).
    expect(onInsert).not.toHaveBeenCalled()
  })

  it('does not subscribe when disabled', () => {
    renderHook(() => useRealtimeReviewInserts(false, vi.fn()))

    expect(state.channels).toHaveLength(0)
  })

  it('triggers the refetch callback on each INSERT event', () => {
    const onInsert = vi.fn()
    renderHook(() => useRealtimeReviewInserts(true, onInsert))

    state.channels[0].insertHandler?.()
    state.channels[0].insertHandler?.()

    expect(onInsert).toHaveBeenCalledTimes(2)
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
    state.channels[0].insertHandler?.()

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    // 콜백 교체가 재구독을 만들지 않는다.
    expect(state.channels).toHaveLength(1)
  })

  it('removes the channel on unmount', () => {
    const { unmount } = renderHook(() => useRealtimeReviewInserts(true, vi.fn()))

    unmount()

    expect(state.removeChannel).toHaveBeenCalledTimes(1)
  })
})
