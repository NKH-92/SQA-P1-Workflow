import { expect, it, vi } from 'vitest'
import { hasSeenMorningBrief, markMorningBriefSeen, morningBriefEnabled, setMorningBriefEnabled } from './morningBrief'
it('shows once per person per business date and supports opt out', () => {
  expect(hasSeenMorningBrief('brief-a', '2026-10-03')).toBe(false)
  markMorningBriefSeen('brief-a', '2026-10-03')
  expect(hasSeenMorningBrief('brief-a', '2026-10-03')).toBe(true)
  expect(hasSeenMorningBrief('brief-a', '2026-10-04')).toBe(false)
  expect(hasSeenMorningBrief('brief-b', '2026-10-03')).toBe(false)
  setMorningBriefEnabled('brief-a', false)
  expect(morningBriefEnabled('brief-a')).toBe(false)
  setMorningBriefEnabled('brief-a', true)
  expect(morningBriefEnabled('brief-a')).toBe(true)
})
it('keeps once-per-day and off preferences when storage fails', () => {
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('blocked') })
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('blocked') })
  markMorningBriefSeen('blocked', '2026-10-03')
  expect(hasSeenMorningBrief('blocked', '2026-10-03')).toBe(true)
  setMorningBriefEnabled('blocked', false)
  expect(morningBriefEnabled('blocked')).toBe(false)
  get.mockRestore(); set.mockRestore()
})
