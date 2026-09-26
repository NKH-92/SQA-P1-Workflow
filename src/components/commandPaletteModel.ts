import type { TabId } from '../app/types'
import { canManageTeamData } from '../domain/permissions'
import { selectScopedReviewRequests } from '../features/reviews/review.selectors'
import { reviewStatusLabels } from '../lib/format'
import { navigationItemsForRole, requestComposer, type ComposerIntentTab } from '../lib/navigation'
import type { AppData, Profile } from '../types'

export type CommandPaletteData = Pick<AppData, 'profiles' | 'reviewRequests'>

export type CommandItem = {
  id: string
  group: string
  title: string
  sub: string
  icon: string
  run: () => void
}

const REVIEW_RESULT_CAP = 20

/** 빠른 이동에서 바로 시작할 수 있는 작성 행동. 권한이 있는 사람에게만 보인다. */
const COMPOSER_ACTIONS: Array<{
  id: string
  tab: ComposerIntentTab
  title: string
  sub: string
  visible: (profile: Profile) => boolean
}> = [
  {
    id: 'action-new-review',
    tab: 'reviews',
    title: '새 검토요청 쓰기',
    sub: '검토요청 화면에서 작성 창을 열어요',
    visible: (profile) => profile.role === 'member',
  },
  {
    id: 'action-new-announcement',
    tab: 'announcements',
    title: '새 공지 쓰기',
    sub: '공지 화면에서 작성 창을 열어요',
    visible: canManageTeamData,
  },
  {
    id: 'action-new-change',
    tab: 'change-applications',
    title: '공통변경 등록하기',
    sub: '변경 적용 화면에서 등록 창을 열어요',
    visible: canManageTeamData,
  },
]

export function commandSearchPlaceholder(leaderMode: boolean) {
  return leaderMode ? '화면, 검토요청, 파트원 검색' : '화면, 검토요청 검색'
}

export function buildCommandItems({
  profile,
  data,
  leaderMode,
  select,
}: {
  profile: Profile
  data: CommandPaletteData
  leaderMode: boolean
  select: (tab: TabId, entityId?: string) => void
}): CommandItem[] {
  const go = (tab: TabId, entityId?: string) => () => select(tab, entityId)
  // 화면 이동이 먼저 온다 — ‘공지’를 찾으면 첫 결과가 공지 화면이어야 한다.
  const result: CommandItem[] = navigationItemsForRole(leaderMode).map((nav) => ({
    id: `nav-${nav.tab}`,
    group: '이동',
    title: nav.paletteLabel,
    sub: `${nav.paletteLabel} 화면으로 이동`,
    icon: nav.paletteLabel.charAt(0),
    run: go(nav.tab),
  }))

  COMPOSER_ACTIONS.filter((action) => action.visible(profile)).forEach((action) => {
    result.push({
      id: action.id,
      group: '새로 만들기',
      title: action.title,
      sub: action.sub,
      icon: '+',
      run: () => {
        requestComposer(action.tab)
        select(action.tab)
      },
    })
  })

  selectScopedReviewRequests(data, profile).forEach((request) => {
    result.push({
      id: `review-${request.id}`,
      group: '검토요청',
      title: request.title,
      sub: `${request.profiles?.name ?? '요청자'} · ${reviewStatusLabels[request.status]}`,
      icon: request.title.trim().charAt(0) || '검',
      run: go('reviews', request.id),
    })
  })

  if (leaderMode) {
    data.profiles
      .filter((item) => item.role === 'member' && item.is_active !== false)
      .forEach((member) => {
        result.push({
          id: `member-${member.id}`,
          group: '파트원',
          title: member.name,
          sub: member.email,
          icon: member.name.trim().charAt(0) || '?',
          run: go('team', member.id),
        })
      })
  }

  return result
}

export function filterCommandItems(items: CommandItem[], query: string) {
  const normalizedQuery = query.trim().toLowerCase()
  const matches = normalizedQuery
    ? items.filter((item) => `${item.title} ${item.sub}`.toLowerCase().includes(normalizedQuery))
    : items
  const cappedReviewIds = new Set(
    matches
      .filter((item) => item.group === '검토요청')
      .slice(0, REVIEW_RESULT_CAP)
      .map((item) => item.id),
  )
  return matches.filter((item) => item.group !== '검토요청' || cappedReviewIds.has(item.id))
}

export function groupCommandItems(items: CommandItem[]) {
  return items.reduce<Record<string, CommandItem[]>>((groups, item) => {
    ;(groups[item.group] ??= []).push(item)
    return groups
  }, {})
}
