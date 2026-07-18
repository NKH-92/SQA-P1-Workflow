import type { TabId } from '../app/types'
import { selectScopedReviewRequests } from '../features/reviews/review.selectors'
import { reviewStatusLabels } from '../lib/format'
import { navigationItemsForRole } from '../lib/navigation'
import type { AppData, Profile } from '../types'

export type CommandItem = {
  id: string
  group: string
  title: string
  sub: string
  icon: string
  run: () => void
}

const REVIEW_RESULT_CAP = 20

export function buildCommandItems({
  profile,
  data,
  leaderMode,
  select,
}: {
  profile: Profile
  data: AppData
  leaderMode: boolean
  select: (tab: TabId, entityId?: string) => void
}): CommandItem[] {
  const go = (tab: TabId, entityId?: string) => () => select(tab, entityId)
  const result: CommandItem[] = navigationItemsForRole(leaderMode).map((nav) => ({
    id: `nav-${nav.tab}`,
    group: '이동',
    title: nav.paletteLabel,
    sub: `${nav.tab} 화면으로 이동`,
    icon: nav.paletteLabel.charAt(0),
    run: go(nav.tab),
  }))

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
      .filter((item) => item.role === 'member')
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
