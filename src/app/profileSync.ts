import type { Profile } from '../types'

const PROFILE_SYNC_FIELDS = ['email', 'name', 'role', 'is_active', 'must_change_password'] as const

export function reconciledProfile(current: Profile, profiles: Profile[]): Profile | null {
  const latest = profiles.find((item) => item.id === current.id)
  if (!latest) return null
  return PROFILE_SYNC_FIELDS.some((field) => latest[field] !== current[field]) ? latest : current
}
