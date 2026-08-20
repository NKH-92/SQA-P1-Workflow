import { previewLeader as demoLeader, previewMember as demoMember } from '../../demoData'
import { isPreviewMode } from '../../lib/supabase'
import type { Profile, Role } from '../../types'
import type { TabId } from '../types'

/** 데모(preview) 모드에서만 leader/member 역할 전환 핸들러를 제공한다. */
export function usePreviewRoleChange(
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>,
  setActiveTab: (tab: TabId, entityId?: string) => void,
) {
  if (!isPreviewMode) return undefined
  return (role: Role) => {
    setProfile(role === 'member' ? demoMember : demoLeader)
    setActiveTab('dashboard')
  }
}
