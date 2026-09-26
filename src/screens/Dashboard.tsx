import { useMemo, useState } from 'react'
import { ChevronRight, ListTodo, Send } from 'lucide-react'
import { EmptyState } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { TabId } from '../app/types'
import { formatDate, formatDateWithWeekday } from '../lib/format'
import { requestComposer } from '../lib/navigation'
import { productCategory, productCompanyName, productName } from '../lib/products'
import { useViewState } from '../hooks/useViewState'
import { selectMyProductChangeTaskContexts } from '../features/change-applications/selectors'
import {
  isMemberHomeFilter,
  MEMBER_HOME_FILTERS,
  selectMemberHomeItems,
  type MemberHomeFilter,
} from '../features/dashboard/memberHomeModel'

/** 첫 화면에서 한 번에 보여 줄 할 일 수. 나머지는 ‘나머지 보기’로 편다. */
const HOME_PREVIEW_COUNT = 6
const OWNED_PREVIEW_COUNT = 4

export function Dashboard({
  profile,
  data,
  setActiveTab,
}: {
  profile: Profile
  data: AppData
  setActiveTab: (tab: TabId, entityId?: string) => void
}) {
  const [filter, setFilter] = useViewState<MemberHomeFilter>('dashboard.member.filter', 'all', isMemberHomeFilter)
  const [showAll, setShowAll] = useState(false)
  const [today] = useState(() => new Date())
  const items = useMemo(() => selectMemberHomeItems(data, profile, today), [data, profile, today])
  const filterCounts = new Map(MEMBER_HOME_FILTERS.map((option) => [
    option.key,
    option.key === 'all' ? items.length : items.filter((item) => item.category === option.key).length,
  ]))
  const filteredItems = filter === 'all' ? items : items.filter((item) => item.category === filter)
  const visibleItems = showAll ? filteredItems : filteredItems.slice(0, HOME_PREVIEW_COUNT)
  const hiddenCount = filteredItems.length - visibleItems.length
  const activeFilterLabel = MEMBER_HOME_FILTERS.find((option) => option.key === filter)?.label ?? '전체'

  const leaderProfile = data.profiles.find((item) => item.role === 'leader')
  const ownProducts = data.productAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownDuties = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id)
  const dutyPreviewCount = Math.max(0, OWNED_PREVIEW_COUNT - ownProducts.length)
  // 한 제품에 같은 공통변경의 할 일이 여러 개여도 공통변경 단위로 한 번만 센다.
  const pendingApplicationsByProduct = new Map<string, Set<string>>()
  for (const { task, application } of selectMyProductChangeTaskContexts(data, profile)) {
    if (task.status !== 'pending') continue
    const applications = pendingApplicationsByProduct.get(task.product_id) ?? new Set<string>()
    applications.add(application.id)
    pendingApplicationsByProduct.set(task.product_id, applications)
  }
  const latestNote = data.profileNotes
    .filter((note) => note.profile_id === profile.id)
    .sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))[0]

  return (
    <div className="stack home member-home">
      <header className="home-header">
        <div className="home-heading">
          <p className="home-greeting">안녕하세요, {profile.name}님 · {formatDateWithWeekday(today)}</p>
          <h1>{items.length > 0 ? <>오늘 할 일이 <em>{items.length}건</em> 있어요</> : '지금 할 일이 없어요'}</h1>
        </div>
        <div className="home-header-actions">
          <button
            className="primary"
            onClick={() => {
              requestComposer('reviews')
              setActiveTab('reviews')
            }}
            type="button"
          >
            <Send aria-hidden="true" size={15} />
            검토요청 쓰기
          </button>
        </div>
      </header>

      <div aria-label="할 일 종류로 거르기" className="home-chips" role="group">
        {MEMBER_HOME_FILTERS.map((option) => (
          <button
            aria-pressed={filter === option.key}
            className="home-chip"
            key={option.key}
            onClick={() => {
              setFilter(option.key)
              setShowAll(false)
            }}
            type="button"
          >
            {option.label} <b>{filterCounts.get(option.key) ?? 0}</b>
          </button>
        ))}
      </div>

      <section aria-labelledby="member-home-todo" className="home-card home-todo">
        <h2 className="sr-only" id="member-home-todo">
          {filter === 'all' ? '할 일 목록' : `${activeFilterLabel} 목록`}
        </h2>
        {filteredItems.length === 0 && (
          <EmptyState
            icon={<ListTodo aria-hidden="true" size={22} />}
            title={filter === 'all' ? '오늘은 급한 할 일이 없어요' : `${activeFilterLabel} 항목이 없어요`}
            description={filter === 'all'
              ? '검토가 필요한 문서나 판단이 있으면 파트장에게 검토요청을 보내 보세요.'
              : '다른 칩을 누르면 나머지 할 일을 볼 수 있어요.'}
          />
        )}
        {visibleItems.length > 0 && (
          <ul className="priority-items">
            {visibleItems.map((item) => (
              <li className="priority-row" data-urgency={item.urgency} key={item.id}>
                <button className="priority-main" onClick={() => setActiveTab(item.targetTab, item.entityId)} type="button">
                  {/* 읽는 순서는 제목부터. 종류(적용 업무·프로젝트·내 검토요청)는 화면에서만 위에 둔다. */}
                  <span className="priority-copy">
                    <strong>{item.title}</strong>
                    <span className="priority-context">{item.kind}</span>
                    <small>{item.meta}</small>
                  </span>
                  <span className="priority-due" data-tone={item.statusTone}>{item.statusLabel}</span>
                  <ChevronRight aria-hidden="true" className="priority-arrow" size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {hiddenCount > 0 && (
          <button className="home-more" onClick={() => setShowAll(true)} type="button">
            나머지 {hiddenCount}건 보기
          </button>
        )}
        {showAll && filteredItems.length > HOME_PREVIEW_COUNT && (
          <button className="home-more" onClick={() => setShowAll(false)} type="button">
            처음 {HOME_PREVIEW_COUNT}건만 보기
          </button>
        )}
      </section>

      {latestNote && (
        <div className="leader-memo">
          <div>
            <span>파트장 메모</span>
            <p>“{latestNote.note}”</p>
            <small>
              {leaderProfile?.name ?? '파트장'} · {formatDate(latestNote.created_at)}
            </small>
          </div>
        </div>
      )}

      <section aria-labelledby="member-home-owned" className="home-card home-owned">
        <div className="home-card-head">
          <h2 id="member-home-owned">내 담당</h2>
          <small>제품 {ownProducts.length} · 정기 업무 {ownDuties.length}</small>
        </div>
        {ownProducts.length === 0 && ownDuties.length === 0 ? (
          <p className="home-card-empty">아직 배정받은 제품이나 업무가 없어요. 배정받으려면 파트장에게 알려 주세요.</p>
        ) : (
          <ul className="home-mini-list">
            {ownProducts.slice(0, OWNED_PREVIEW_COUNT).map((assignment) => {
              const name = productName(assignment)
              const pendingApplications = [...(pendingApplicationsByProduct.get(assignment.product_id) ?? [])]
              const meta = [productCategory(assignment), productCompanyName(assignment)].filter(Boolean).join(' · ')
              const firstPendingApplicationId = pendingApplications[0]
              return (
                <li key={assignment.id}>
                  <button
                    aria-label={firstPendingApplicationId
                      ? `${name} 미적용 공통변경 ${pendingApplications.length}건 열기`
                      : undefined}
                    className="home-mini-row"
                    onClick={() => (firstPendingApplicationId
                      ? setActiveTab('change-applications', firstPendingApplicationId)
                      : setActiveTab('work'))}
                    type="button"
                  >
                    <span className="home-mini-copy">
                      <strong>{name}</strong>
                      <small>
                        {meta}
                        {firstPendingApplicationId && <em> · 미적용 {pendingApplications.length}건</em>}
                      </small>
                    </span>
                    <ChevronRight aria-hidden="true" size={15} />
                  </button>
                </li>
              )
            })}
            {ownDuties.slice(0, dutyPreviewCount).map((assignment) => (
              <li key={assignment.id}>
                <button className="home-mini-row" onClick={() => setActiveTab('work')} type="button">
                  <span className="home-mini-copy">
                    <strong>{assignment.duties?.name ?? '이름 없는 업무'}</strong>
                    <small>정기 업무 · {assignment.duties?.duty_major_categories?.name ?? '대분류 없음'}</small>
                  </span>
                  <ChevronRight aria-hidden="true" size={15} />
                </button>
              </li>
            ))}
          </ul>
        )}
        {(ownProducts.length + ownDuties.length) > 0 && (
          <button className="home-card-link" onClick={() => setActiveTab('work')} type="button">
            담당 제품·업무 모두 보기
            <ChevronRight aria-hidden="true" size={14} />
          </button>
        )}
      </section>
    </div>
  )
}
