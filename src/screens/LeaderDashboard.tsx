import { useMemo, useState } from 'react'
import { formatDateWithWeekday } from '../lib/format'
import { ChevronRight, ListTodo, Megaphone, UserPlus } from 'lucide-react'
import { EmptyState } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { canManageTeamData } from '../domain/permissions'
import { dueState } from '../lib/dates'
import { quoted } from '../lib/korean'
import { requestComposer } from '../lib/navigation'
import { useViewState } from '../hooks/useViewState'
import {
  isPriorityFilter,
  matchesPriorityFilter,
  PRIORITY_FILTERS,
  PRIORITY_GROUPS,
  selectLeaderPriorityQueue,
  selectUnassignedProductImpact,
  type PriorityFilter,
  type PriorityItem,
} from '../features/dashboard/prioritySelectors'
import { selectActiveProjects } from '../features/dashboard/dashboardModels'
import { useLeaderReviewOverview } from '../features/dashboard/useLeaderReviewOverview'
import { useTeamSummaries } from '../hooks/useTeamSummaries'

const PRIORITY_PREVIEW_COUNT = 8
const PROJECT_PREVIEW_COUNT = 3
/** 제품 화면의 ‘담당자 없음’ 필터(useViewState 'products.leader.filter')를 미리 골라 둔다. */
const PRODUCT_FILTER_STORAGE_KEY = 'sqa.view.products.leader.filter'

function openUnassignedProducts(setActiveTab: (tab: TabId) => void) {
  try {
    window.sessionStorage.setItem(PRODUCT_FILTER_STORAGE_KEY, JSON.stringify('unassigned'))
  } catch {
    // 저장소를 쓸 수 없으면 필터 없이 제품 화면만 연다.
  }
  setActiveTab('products')
}

function PriorityRow({
  item,
  canManage,
  onOpen,
}: {
  item: PriorityItem
  canManage: boolean
  onOpen: (item: PriorityItem) => void
}) {
  return (
    <li className="priority-row" data-urgency={item.urgency}>
      {/* 읽는 순서는 제목부터(종류 칩은 화면에서만 앞에 둔다). 메뉴 이름으로 시작하는 버튼 이름을 피한다. */}
      <button className="priority-main" onClick={() => onOpen(item)} type="button">
        <span className="priority-copy">
          <strong>{item.title}</strong>
          <small>{item.meta}</small>
        </span>
        <span className="priority-kind">{item.kind}</span>
        <span className="priority-due" data-tone={item.statusTone}>{item.statusLabel}</span>
      </button>
      {canManage && (
        <button
          aria-label={`${quoted(item.title)} ${item.action}`}
          className={item.category === 'review' ? 'primary compact priority-action' : 'ghost compact priority-action'}
          onClick={() => onOpen(item)}
          type="button"
        >
          {item.action}
        </button>
      )}
    </li>
  )
}

export function LeaderDashboard({
  profile,
  data,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const canManage = canManageTeamData(profile)
  const [showAllPriorities, setShowAllPriorities] = useState(false)
  const [filter, setFilter] = useViewState<PriorityFilter>('dashboard.leader.filter', 'all', isPriorityFilter)
  const { teamMembers } = useTeamSummaries(data)
  const priorityQueue = useMemo(() => selectLeaderPriorityQueue(data, teamMembers), [data, teamMembers])
  const filterCounts = useMemo(
    () => new Map(PRIORITY_FILTERS.map((option) => [
      option.key,
      priorityQueue.filter((item) => matchesPriorityFilter(item, option.key)).length,
    ])),
    [priorityQueue],
  )
  const filteredQueue = priorityQueue.filter((item) => matchesPriorityFilter(item, filter))
  const visibleQueue = showAllPriorities ? filteredQueue : filteredQueue.slice(0, PRIORITY_PREVIEW_COUNT)
  const hiddenPriorityCount = filteredQueue.length - visibleQueue.length
  const priorityGroups = PRIORITY_GROUPS.map((group) => ({
    ...group,
    total: filteredQueue.filter((item) => item.group === group.key).length,
    items: visibleQueue.filter((item) => item.group === group.key),
  })).filter((group) => group.items.length > 0)

  const { products: unassignedProducts, blockedTaskCount } = selectUnassignedProductImpact(data)
  const activeProjects = selectActiveProjects(data)
  const reviewOverview = useLeaderReviewOverview(data)
  const monthlyRows = reviewOverview.status === 'ready' ? reviewOverview.envelope.monthly_breakdown : []
  const currentMonth = monthlyRows[monthlyRows.length - 1]
  const [today] = useState(() => new Date())

  const openItem = (item: PriorityItem) => {
    if (item.category === 'product') {
      openUnassignedProducts(setActiveTab)
      return
    }
    setActiveTab(item.targetTab, item.entityId)
  }

  const total = priorityQueue.length
  const title = canManage
    ? total > 0 ? <>오늘 처리할 일이 <em>{total}건</em> 있어요</> : '오늘 처리할 일이 없어요'
    : total > 0 ? <>파트에서 처리할 일이 <em>{total}건</em> 있어요</> : '파트에 밀린 일이 없어요'
  const activeFilterLabel = PRIORITY_FILTERS.find((option) => option.key === filter)?.label ?? '전체'

  return (
    <div className="stack home leader-home">
      <header className="home-header">
        <div className="home-heading">
          <p className="home-greeting">안녕하세요, {profile.name}님 · {formatDateWithWeekday(today)}</p>
          <h1>{title}</h1>
        </div>
        {canManage && (
          <div className="home-header-actions">
            <button
              className="ghost"
              onClick={() => {
                requestComposer('announcements')
                setActiveTab('announcements')
              }}
              type="button"
            >
              <Megaphone aria-hidden="true" size={15} />
              <span className="home-action-label">새 공지 쓰기</span>
            </button>
          </div>
        )}
      </header>

      <div aria-label="할 일 종류로 거르기" className="home-chips" role="group">
        {PRIORITY_FILTERS.map((option) => (
          <button
            aria-pressed={filter === option.key}
            className="home-chip"
            data-tone={option.tone}
            key={option.key}
            onClick={() => {
              setFilter(option.key)
              setShowAllPriorities(false)
            }}
            type="button"
          >
            {option.label} <b>{filterCounts.get(option.key) ?? 0}</b>
          </button>
        ))}
      </div>

      <div className="home-grid">
        <section aria-labelledby="leader-home-todo" className="home-card home-todo">
          <h2 className="sr-only" id="leader-home-todo">
            {filter === 'all' ? '처리할 일 목록' : `${activeFilterLabel} 목록`}
          </h2>
          {priorityGroups.length === 0 && (
            <EmptyState
              icon={<ListTodo aria-hidden="true" size={22} />}
              title={filter === 'all' ? '오늘 먼저 처리할 일이 없어요' : `${activeFilterLabel} 항목이 없어요`}
              description={filter === 'all'
                ? '새 검토요청이 오면 급한 순서대로 여기에 보여요.'
                : '다른 칩을 누르면 나머지 할 일을 볼 수 있어요.'}
            />
          )}
          {priorityGroups.map((group) => (
            <div className="priority-group" data-urgency={group.urgency} key={group.key}>
              <h3 className="priority-group-label">
                {group.label}
                <small>{group.total}건</small>
              </h3>
              <ul className="priority-items">
                {group.items.map((item) => (
                  <PriorityRow canManage={canManage} item={item} key={item.id} onOpen={openItem} />
                ))}
              </ul>
            </div>
          ))}
          {hiddenPriorityCount > 0 && (
            <button className="home-more" onClick={() => setShowAllPriorities(true)} type="button">
              나머지 {hiddenPriorityCount}건 보기
            </button>
          )}
          {showAllPriorities && filteredQueue.length > PRIORITY_PREVIEW_COUNT && (
            <button className="home-more" onClick={() => setShowAllPriorities(false)} type="button">
              처음 {PRIORITY_PREVIEW_COUNT}건만 보기
            </button>
          )}
        </section>

        <aside aria-label="파트 현황" className="home-rail">
          {unassignedProducts.length > 0 && (
            <section className="home-card home-callout">
              <p>
                <strong>담당자가 없는 제품이 {unassignedProducts.length}개 있어요</strong>
                <small>
                  {unassignedProducts.slice(0, 3).map((product) => product.name).join(', ')}
                  {unassignedProducts.length > 3 ? ` 외 ${unassignedProducts.length - 3}개` : ''}
                  {blockedTaskCount > 0 ? ` · 적용 업무 ${blockedTaskCount}건이 멈춰 있어요` : ''}
                </small>
              </p>
              <button
                className={canManage ? 'primary compact' : 'ghost compact'}
                onClick={() => openUnassignedProducts(setActiveTab)}
                type="button"
              >
                {canManage && <UserPlus aria-hidden="true" size={15} />}
                {canManage ? '담당자 배정하기' : '제품 보기'}
              </button>
            </section>
          )}

          <section aria-labelledby="leader-home-projects" className="home-card">
            <div className="home-card-head">
              <h2 id="leader-home-projects">진행 중 프로젝트</h2>
              <small>{activeProjects.length}개</small>
            </div>
            {activeProjects.length === 0 ? (
              <p className="home-card-empty">진행 중인 프로젝트가 없어요.</p>
            ) : (
              <ul className="home-mini-list">
                {activeProjects.slice(0, PROJECT_PREVIEW_COUNT).map((project) => {
                  const due = dueState(project.deadline, { now: today })
                  return (
                    <li key={project.id}>
                      <button className="home-mini-row" onClick={() => setActiveTab('projects', project.id)} type="button">
                        <strong>{project.name}</strong>
                        <span className="priority-due" data-tone={due.tone}>
                          {due.kind === 'none' ? '마감일 없음' : due.shortLabel}
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
            <button className="home-card-link" onClick={() => setActiveTab('projects')} type="button">
              모든 프로젝트 보기
              <ChevronRight aria-hidden="true" size={14} />
            </button>
          </section>

          <section aria-labelledby="leader-home-reviews" className="home-card">
            <div className="home-card-head">
              <h2 id="leader-home-reviews">이번 달 검토</h2>
              <button className="home-card-link inline" onClick={() => setActiveTab('review-stats')} type="button">
                검토 통계 보기
                <ChevronRight aria-hidden="true" size={14} />
              </button>
            </div>
            {reviewOverview.status === 'loading' && (
              <p className="home-card-empty" role="status">이번 달 검토를 집계하고 있어요.</p>
            )}
            {reviewOverview.status === 'error' && (
              <div className="home-card-empty home-card-error" role="alert">
                <p>이번 달 검토를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요.</p>
                <button className="ghost compact" onClick={reviewOverview.retry} type="button">다시 시도</button>
              </div>
            )}
            {reviewOverview.status === 'ready' && (
              <dl aria-busy={reviewOverview.refreshing ? true : undefined} className="home-stats">
                <div>
                  <dt>받은 요청</dt>
                  <dd>{(currentMonth?.new_requests ?? 0) + (currentMonth?.resubmissions ?? 0)}</dd>
                </div>
                <div>
                  <dt>승인</dt>
                  <dd>{currentMonth?.approvals ?? 0}</dd>
                </div>
                <div>
                  <dt>반려</dt>
                  <dd>{currentMonth?.rejections ?? 0}</dd>
                </div>
              </dl>
            )}
          </section>
        </aside>
      </div>
    </div>
  )
}
