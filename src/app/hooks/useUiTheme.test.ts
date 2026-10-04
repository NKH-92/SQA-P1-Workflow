import { act, renderHook } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { useUiTheme } from './useUiTheme'
import type { HomeMode } from '../../lib/homeMode'
afterEach(() => { localStorage.clear(); vi.restoreAllMocks() })
it('derives until selected and isolates accounts', () => {
  const { result, rerender } = renderHook(({ id, home }: { id: string | null; home: HomeMode }) => useUiTheme(id, home), { initialProps: { id: 'a', home: 'office' } })
  expect(result.current).toMatchObject({ theme: 'pixel', explicit: false })
  rerender({ id: 'a', home: 'classic' })
  expect(result.current.theme).toBe('classic')
  act(() => result.current.setTheme('pixel'))
  expect(localStorage.getItem('sqa.ui-theme.a')).toBe('pixel')
  rerender({ id: 'b', home: 'classic' })
  expect(result.current).toMatchObject({ theme: 'classic', explicit: false })
  rerender({ id: 'a', home: 'classic' })
  expect(result.current).toMatchObject({ theme: 'pixel', explicit: true })
})
it('keeps a session choice when storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
  const { result } = renderHook(() => useUiTheme('a', 'classic'))
  act(() => result.current.setTheme('pixel'))
  expect(result.current.theme).toBe('pixel')
})
