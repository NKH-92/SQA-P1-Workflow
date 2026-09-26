import { previewLeader as demoLeader, previewMember as demoMember } from '../../demoData'
import type { NavigateOptions } from '../../lib/navigation'
import { isPreviewMode } from '../../lib/supabase'
import type { Profile, Role } from '../../types'
import type { TabId } from '../types'

/** 미리보기의 팀장: 파트 현황을 모두 보지만 수정할 수는 없는 읽기 전용 역할. */
export const previewTeamLeader: Profile = {
  id: 'demo-team-leader',
  email: 'preview-team-leader@example.com',
  name: '미리보기 팀장',
  role: 'team_leader',
}

function previewProfileFor(role: Role): Profile {
  if (role === 'member') return demoMember
  if (role === 'team_leader') return previewTeamLeader
  return demoLeader
}

/** 데모(preview) 모드에서만 파트장·팀장·파트원 역할 전환 핸들러를 제공한다. */
export function usePreviewRoleChange(
  setProfile: React.Dispatch<React.SetStateAction<Profile | null>>,
  setActiveTab: (tab: TabId, entityId?: string, options?: NavigateOptions) => void,
) {
  if (!isPreviewMode) return undefined
  return (role: Role) => {
    setProfile(previewProfileFor(role))
    // 역할 전환은 화면 이동 기록이 아니다. 기록을 쌓지 않아야 열린 서랍 메뉴도 그대로 남는다.
    setActiveTab('dashboard', undefined, { replace: true })
  }
}
