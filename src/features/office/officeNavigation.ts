import { canViewTeamData } from '../../domain/permissions'
import { navigationItemsForRole, type TabId } from '../../lib/navigation'
import type { Profile } from '../../types'
import type { SceneHotspotId } from './officeScene'

/** 회의실은 화면을 옮기지 않고 회의 창을 연다. 나머지 기물은 누르면 그 화면으로 간다. */
export type TabHotspotId = Exclude<SceneHotspotId, 'meeting' | 'menu'>

/** 사무실 기물을 누르면 가는 화면 */
export const HOTSPOT_TABS: Record<TabHotspotId, TabId> = {
  projects: 'projects',
  cabinet: 'change-applications',
  kanban: 'reviews',
  notice: 'announcements',
  nameplates: 'team',
  stats: 'review-stats',
  gate: 'invites',
  logbook: 'activity',
  samples: 'products',
  duties: 'duties',
}

export const HOTSPOT_LABELS: Record<SceneHotspotId, { name: string; destination: string }> = {
  menu: { name: '메뉴판', destination: '이번 주 메뉴' },
  projects: { name: '프로젝트 보드', destination: '프로젝트' },
  cabinet: { name: '변경관리 문서함', destination: '변경 적용' },
  kanban: { name: '검토요청 보드', destination: '검토요청' },
  notice: { name: '공지 화면', destination: '공지' },
  nameplates: { name: '명패 보드', destination: '파트원' },
  stats: { name: '검토 통계 모니터', destination: '검토 통계' },
  gate: { name: '출입 게이트', destination: '계정 관리' },
  logbook: { name: '출입 기록부', destination: '활동 로그' },
  samples: { name: '제품 샘플 보관장', destination: '제품' },
  duties: { name: '업무 분장표', destination: '업무 카테고리' },
  meeting: { name: '회의실', destination: '회의' },
}

const TAB_HOTSPOTS: Partial<Record<TabId, TabHotspotId>> = Object.fromEntries(
  (Object.entries(HOTSPOT_TABS) as Array<[TabHotspotId, TabId]>).map(([hotspot, tab]) => [tab, hotspot]),
)

/** 업무 화면 상단바 장소 명판에 적는 ‘지금 서 있는 기물’. 기물이 없는 화면(내 담당)은 내 책상이다. */
export function placePlateFor(tab: TabId): { name: string } | null {
  if (tab === 'dashboard') return null
  if (tab === 'work') return { name: '내 책상' }
  const hotspot = TAB_HOTSPOTS[tab]
  return hotspot ? { name: HOTSPOT_LABELS[hotspot].name } : null
}

export function isTabHotspot(id: SceneHotspotId): id is TabHotspotId {
  return id !== 'meeting' && id !== 'menu'
}

/**
 * 이 사람이 누를 수 있는 기물. 메뉴에 없는 화면(파트원에게 검토 통계·제품 등)으로 가는 기물은 빼고,
 * 회의실은 모두에게 보인다(팀장은 보기만 한다).
 */
export function hotspotsForViewer(ids: readonly SceneHotspotId[], viewer: Profile): SceneHotspotId[] {
  const leaderMode = viewer.is_active !== false && canViewTeamData(viewer)
  const tabs = new Set(navigationItemsForRole(leaderMode).map((item) => item.tab))
  return ids.filter((id) => !isTabHotspot(id) || tabs.has(HOTSPOT_TABS[id]))
}

export type PersonDestination =
  | { tab: 'work' }
  | { tab: 'team'; entityId: string }
  /** 파트장·팀장은 파트원 화면에 없어서, 프로젝트 화면을 사람별 보기로 그 이름을 찾아 연다. */
  | { tab: 'projects'; personName: string }

/**
 * 사무실 사람을 눌렀을 때 그 사람의 담당을 보여 줄 화면.
 * 파트원 화면에서는 본인 담당만 볼 수 있어서(다른 파트원 배정은 조회 권한이 없다) 본인만 누를 수 있다.
 */
export function personDestination(
  viewer: Profile,
  person: { profileId: string; name: string },
  profiles: readonly Pick<Profile, 'id' | 'role'>[],
): PersonDestination | null {
  const leaderMode = viewer.is_active !== false && canViewTeamData(viewer)
  if (!leaderMode) return person.profileId === viewer.id ? { tab: 'work' } : null
  const role = profiles.find((profile) => profile.id === person.profileId)?.role
  if (role === 'member') return { tab: 'team', entityId: person.profileId }
  if (role === 'leader' || role === 'team_leader') return { tab: 'projects', personName: person.name }
  return null
}
