import { describe, expect, it } from 'vitest'
import type { Profile } from '../types'
import { reconciledProfile } from './profileSync'

const leader: Profile = {
  id: 'user-1',
  email: 'user@example.com',
  name: 'User',
  role: 'leader',
  is_active: true,
  must_change_password: false,
}

describe('reconciledProfile', () => {
  it('returns the same object when the refreshed profile has not changed', () => {
    expect(reconciledProfile(leader, [{ ...leader }])).toBe(leader)
  })

  it('returns refreshed role and active-state changes', () => {
    const downgraded = { ...leader, role: 'member' as const, is_active: false }
    expect(reconciledProfile(leader, [downgraded])).toBe(downgraded)
  })

  it('returns null when the current user row is absent', () => {
    expect(reconciledProfile(leader, [])).toBeNull()
  })
})
