import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import type { Dispatch, SetStateAction } from 'react'
import { ArrowLeft, ArrowRight, Download, Search, SlidersHorizontal, StickyNote, UserPlus } from 'lucide-react'
import { Badge, DialogActions, EmptyState, Modal, Rows } from '../components/ui'
import type { AppData, Profile } from '../types'
import type { MutateFn, TabId } from '../app/types'
import { downloadCsv } from '../lib/csv'
import { buildProductAllocationCsvRows } from '../lib/productAllocationCsv'
import { formatDate, projectStatusLabels, roleLabels } from '../lib/format'
import { preferredScrollBehavior } from '../lib/motion'
import { compareProducts, productCategory, productCompanyName, productName } from '../lib/products'
import type { ProductSortKey } from '../lib/products'
import { useTeamSummaries, type TeamSummary } from '../hooks/useTeamSummaries'
import { useMobileDetail } from '../hooks/useMobileDetail'
import { useViewState } from '../hooks/useViewState'
import { useSelectionHashSync } from '../app/hooks/useHashNavigation'
import { useTeamController } from '../features/team/useTeamController'
import { dueBadgeStatus, projectDueState } from '../features/projects/project.selectors'
import { canManageTeamData } from '../domain/permissions'

/** 제품 화면의 담당 필터(products 도메인 소유). 파트원 화면에서는 이 세 값만 쓴다. */
type ProductsLeaderFilter = 'all' | 'unassigned' | 'inactive'

const isString = (value: unknown): value is string => typeof value === 'string'
const isBoolean = (value: unknown): value is boolean => typeof value === 'boolean'
const isProductsLeaderFilter = (value: unknown): value is ProductsLeaderFilter =>
  value === 'all' || value === 'unassigned' || value === 'inactive'

const NOTE_MAX_LENGTH = 2000

/** 관리 메모 창. 쓰던 메모가 있으면 닫기 전에 확인하고, 저장해도 창은 열려 있어 이어서 볼 수 있다. */
function TeamNoteModal({
  summary,
  onClose,
  onSave,
}: {
  summary: TeamSummary
  onClose: () => void
  onSave: (note: string) => Promise<boolean>
}) {
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const formId = useId()
  const fieldId = useId()
  const hintId = useId()
  const errorId = useId()
  const listHeadingId = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const notes = [...summary.notes].sort((left, right) => (right.created_at ?? '').localeCompare(left.created_at ?? ''))

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    if (!note.trim()) {
      setError('메모 내용을 입력해 주세요')
      fieldRef.current?.focus()
      return
    }
    setSaving(true)
    try {
      const ok = await onSave(note.trim())
      if (ok) setNote('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      className="team-note-modal"
      closeLabel="관리 메모 닫기"
      dirty={note.trim().length > 0}
      eyebrow="관리 메모"
      icon={<StickyNote size={18} />}
      onClose={onClose}
      open
      title={summary.member.name}
    >
      <div className="team-note-body">
        <form className="note-form team-note-form" id={formId} noValidate onSubmit={(event) => void submit(event)}>
          <label htmlFor={fieldId}>새 메모</label>
          <textarea
            ref={fieldRef}
            aria-describedby={error ? `${errorId} ${hintId}` : hintId}
            aria-invalid={error ? true : undefined}
            id={fieldId}
            maxLength={NOTE_MAX_LENGTH}
            onChange={(event) => {
              setNote(event.target.value)
              if (error && event.target.value.trim()) setError(null)
            }}
            placeholder="배정 조정, 인수인계, 함께 알아 둘 내용"
            value={note}
          />
          {error && (
            <p className="field-error" id={errorId}>
              {error}
            </p>
          )}
          <small id={hintId}>이 메모는 {summary.member.name}님도 볼 수 있어요.</small>
        </form>
        <section aria-labelledby={listHeadingId} className="team-note-history">
          <h3 id={listHeadingId}>남긴 메모 {notes.length}개</h3>
          <div className="note-list">
            {notes.length === 0 && <p className="empty">아직 남긴 메모가 없어요. 첫 메모를 남겨 보세요.</p>}
            {notes.map((item) => (
              <article key={item.id}>
                <p>{item.note}</p>
                <span>{formatDate(item.created_at)}</span>
              </article>
            ))}
          </div>
        </section>
      </div>
      <DialogActions onClose={onClose}>
        <button className="primary" disabled={saving} form={formId} type="submit">
          {saving ? '저장하는 중…' : '메모 저장하기'}
        </button>
      </DialogActions>
    </Modal>
  )
}

export function TeamPanel({
  profile,
  data,
  mutate,
  setData,
  setActiveTab,
  initialSelectedId,
  onInitialSelectionApplied,
}: {
  profile: Profile
  data: AppData
  mutate: MutateFn
  setData: Dispatch<SetStateAction<AppData>>
  setActiveTab: (tab: TabId, entityId?: string) => void
  initialSelectedId?: string | null
  onInitialSelectionApplied?: () => void
}) {
  const canManage = canManageTeamData(profile)
  const controller = useTeamController(profile, data, setData)
  const { teamMembers, teamSummaries } = useTeamSummaries(data)
  // 검색어·비활성 포함·선택한 파트원은 다른 메뉴에 다녀와도 그대로 둔다.
  const [memberSearch, setMemberSearch] = useViewState('team.leader.query', '', isString)
  const [includeInactive, setIncludeInactive] = useViewState('team.leader.includeInactive', false, isBoolean)
  const [selectedMemberId, setSelectedMemberId] = useViewState(
    'team.leader.selected',
    teamMembers.find((member) => member.is_active !== false)?.id ?? '',
    isString,
  )
  const [, setProductsFilter] = useViewState<ProductsLeaderFilter>('products.leader.filter', 'all', isProductsLeaderFilter)
  const [productSortKey, setProductSortKey] = useState<ProductSortKey>('source')
  const [noteModalOpen, setNoteModalOpen] = useState(false)
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false)
  const [pendingProductsNavigation, setPendingProductsNavigation] = useState(false)
  const detailRef = useRef<HTMLDivElement>(null)

  // 커맨드 팔레트에서 넘어온 파트원을 바로 선택한다(검토요청 큐와 같은 딥링크 방식).
  useEffect(() => {
    if (!initialSelectedId) return
    const target = teamSummaries.find((summary) => summary.member.id === initialSelectedId)
    if (!target) return
    if (target.member.is_active === false) setIncludeInactive(true)
    setMemberSearch('')
    setSelectedMemberId(initialSelectedId)
    onInitialSelectionApplied?.()
  }, [initialSelectedId, onInitialSelectionApplied, setIncludeInactive, setMemberSearch, setSelectedMemberId, teamSummaries])

  // 제품 화면의 담당 필터를 먼저 저장(useViewState effect)한 뒤에 화면을 옮긴다.
  useEffect(() => {
    if (!pendingProductsNavigation) return
    setPendingProductsNavigation(false)
    setActiveTab('products')
  }, [pendingProductsNavigation, setActiveTab])

  const activeMemberCount = teamMembers.filter((member) => member.is_active !== false).length
  const managedSummaries = includeInactive
    ? teamSummaries
    : teamSummaries.filter((summary) => summary.member.is_active !== false)
  const query = memberSearch.trim().toLowerCase()
  const filteredSummaries = managedSummaries.filter((summary) => {
    if (!query) return true
    const target = [
      summary.member.name,
      summary.member.email,
      ...summary.products.map((assignment) => assignment.products?.name ?? ''),
      ...summary.duties.map((assignment) => assignment.duties?.name ?? ''),
      ...summary.projects.map((assignment) => assignment.projects?.name ?? ''),
    ]
      .join(' ')
      .toLowerCase()
    return target.includes(query)
  })

  useEffect(() => {
    const nextSelectedId = filteredSummaries.some((summary) => summary.member.id === selectedMemberId)
      ? selectedMemberId
      : filteredSummaries[0]?.member.id ?? ''
    if (nextSelectedId !== selectedMemberId) setSelectedMemberId(nextSelectedId)
  }, [filteredSummaries, selectedMemberId, setSelectedMemberId])

  const selectedSummary = filteredSummaries.find((summary) => summary.member.id === selectedMemberId)
    ?? filteredSummaries[0]
  useSelectionHashSync('team', initialSelectedId ? undefined : selectedSummary?.member.id ?? null)
  const selectedProducts = selectedSummary
    ? [...selectedSummary.products].sort((left, right) => compareProducts(left, right, productSortKey))
    : []
  const ownCompanyProducts = selectedProducts.filter((assignment) => productCategory(assignment) === '자사')
  const consignedProducts = selectedProducts.filter((assignment) => productCategory(assignment) === '위탁')

  const closeMobileDetail = useCallback(() => {
    setMobileDetailOpen(false)
    // 목록으로 돌아오면 방금 보던 파트원 카드에 포커스를 돌려준다.
    window.requestAnimationFrame(() => {
      const card = document.querySelector<HTMLElement>('.v2-team-card[aria-pressed="true"]')
      if (!card) return
      if (typeof card.scrollIntoView === 'function') {
        card.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'nearest' })
      }
      card.focus({ preventScroll: true })
    })
  }, [])

  useMobileDetail({
    open: mobileDetailOpen && Boolean(selectedSummary),
    detailRef,
    onBack: closeMobileDetail,
    selectionKey: selectedSummary?.member.id ?? null,
  })

  const exportTeamCsv = () =>
    downloadCsv(
      'product-allocations.csv',
      buildProductAllocationCsvRows(data),
    )

  const addProfileNote = (member: Profile, note: string) =>
    mutate(async () => {
      await controller.addProfileNote(member.id, note)
    }, `메모를 저장했어요. ${member.name}님도 이 메모를 볼 수 있어요.`)

  /** 제품 담당은 제품 화면에서 바꾼다. 비활성 파트원이면 ‘비활성 담당’ 제품만 모아 보여준다. */
  const openProductAssignment = (member: Profile) => {
    setProductsFilter(member.is_active === false ? 'inactive' : 'all')
    setPendingProductsNavigation(true)
  }

  const clearSearch = () => setMemberSearch('')

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>파트원</h1>
        <p>
          파트원 <strong>{activeMemberCount}명</strong>의 담당 제품, 정기 업무, 프로젝트를 한눈에 봐요.
        </p>
      </div>
      <div className="section-toolbar">
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="파트원 검색"
            placeholder="이름, 제품, 업무, 프로젝트 검색"
            value={memberSearch}
            onChange={(event) => setMemberSearch(event.target.value)}
          />
        </label>
        <button
          aria-pressed={includeInactive}
          className={includeInactive ? 'ghost selected' : 'ghost'}
          onClick={() => setIncludeInactive((value) => !value)}
          type="button"
        >
          비활성 파트원 포함
        </button>
        <button className="ghost" onClick={exportTeamCsv} type="button">
          <Download size={16} />
          CSV 내려받기
        </button>
      </div>
      <div className="team-workbench" data-mobile-detail={mobileDetailOpen ? 'open' : 'closed'}>
        <div className="team-directory">
          <div className="v2-team-grid">
            {filteredSummaries.map((summary) => {
              const selected = selectedSummary?.member.id === summary.member.id
              const openReviews = summary.reviews.filter((request) => request.status === 'pending')
              return (
                <button
                  aria-pressed={selected}
                  className={selected ? 'v2-team-card selected' : 'v2-team-card'}
                  key={summary.member.id}
                  onClick={() => {
                    setSelectedMemberId(summary.member.id)
                    setMobileDetailOpen(true)
                  }}
                  type="button"
                >
                  <div className="v2-team-head">
                    <span>
                      <strong>{summary.member.name}</strong>
                      <small>{summary.member.email}</small>
                    </span>
                    <Badge>{roleLabels[summary.member.role]}</Badge>
                    {summary.member.is_active === false && <Badge status="withdrawn">비활성</Badge>}
                  </div>
                  <div className="metric-strip">
                    <span>제품 <strong>{summary.products.length}</strong></span>
                    <span>업무 <strong>{summary.duties.length}</strong></span>
                    <span>프로젝트 <strong>{summary.projects.length}</strong></span>
                    <span>대기 검토 <strong>{openReviews.length}</strong></span>
                  </div>
                </button>
              )
            })}
          </div>
          {filteredSummaries.length === 0 && (
            query ? (
              <EmptyState
                icon={<Search size={22} />}
                title="검색 조건에 맞는 파트원이 없어요"
                description="이름, 제품, 업무, 프로젝트 이름으로 찾아보세요."
                action={
                  <button className="ghost compact" onClick={clearSearch} type="button">
                    검색어 지우기
                  </button>
                }
              />
            ) : (
              <EmptyState
                icon={<UserPlus size={22} />}
                title="아직 파트원이 없어요"
                description="계정 관리에서 파트원 계정을 추가하면 여기에 보여요."
                action={
                  canManage ? (
                    <button className="ghost compact" onClick={() => setActiveTab('invites')} type="button">
                      계정 관리로 가기
                    </button>
                  ) : undefined
                }
              />
            )
          )}
        </div>

        {selectedSummary && (
          <div ref={detailRef} className="detail-panel summary-panel team-member-detail">
            <div className="detail-header">
              <div>
                <button className="ghost compact team-detail-back" onClick={closeMobileDetail} type="button">
                  <ArrowLeft aria-hidden="true" size={14} />
                  파트원 목록
                </button>
                <span>선택 파트원</span>
                <div className="detail-header-title-row">
                  <h2 data-detail-title>{selectedSummary.member.name}</h2>
                  {canManage && (
                    <button className="ghost compact" onClick={() => setNoteModalOpen(true)} type="button">
                      <StickyNote size={15} aria-hidden="true" />
                      관리 메모
                      {selectedSummary.notes.length > 0 && <span className="memo-count">{selectedSummary.notes.length}</span>}
                    </button>
                  )}
                </div>
                <p>{selectedSummary.member.email}</p>
              </div>
              <div className="detail-header-actions">
                <label className="sort-select">
                  <SlidersHorizontal aria-hidden="true" size={14} />
                  <select aria-label="담당 제품 정렬" value={productSortKey} onChange={(event) => setProductSortKey(event.target.value as ProductSortKey)}>
                    <option value="source">원본순</option>
                    <option value="name">제품명순</option>
                    <option value="company">위탁사명순</option>
                  </select>
                </label>
                {canManage && (
                  <button
                    className="ghost"
                    onClick={() => openProductAssignment(selectedSummary.member)}
                    title="제품 화면으로 이동해 담당자를 바꿔요"
                    type="button"
                  >
                    제품 배정하기
                    <ArrowRight aria-hidden="true" size={14} />
                  </button>
                )}
              </div>
            </div>
            <div className="team-member-quad">
              <div>
                <h3>자사제품</h3>
                <Rows
                  empty="배정된 자사제품이 없어요."
                  rows={ownCompanyProducts.map((assignment) => ({
                    title: productName(assignment),
                    meta: productCompanyName(assignment),
                  }))}
                  wrap
                />
              </div>
              <div>
                <h3>위탁제품</h3>
                <Rows
                  empty="배정된 위탁제품이 없어요."
                  rows={consignedProducts.map((assignment) => ({
                    title: productName(assignment),
                    meta: productCompanyName(assignment) || '위탁사 없음',
                  }))}
                  wrap
                />
              </div>
              <div>
                <h3>업무</h3>
                <Rows
                  empty="담당 업무가 없어요."
                  rows={selectedSummary.duties.map((assignment) => ({
                    title: assignment.duties?.name ?? '이름 없는 업무',
                    meta: assignment.duties?.duty_major_categories?.name ?? '대분류 없음',
                  }))}
                  wrap
                />
              </div>
              <div>
                <h3>프로젝트</h3>
                <Rows
                  empty="배정된 프로젝트가 없어요."
                  rows={selectedSummary.projects.map((assignment) => {
                    const project = assignment.projects
                      ?? data.projects.find((item) => item.id === assignment.project_id)
                      ?? null
                    const due = project ? projectDueState(project) : null
                    return {
                      title: project?.name ?? '이름 없는 프로젝트',
                      meta: project?.deadline ? `마감 ${formatDate(project.deadline)}` : '마감일 없음',
                      extra: due && due.kind !== 'none' && due.kind !== 'done'
                        ? <Badge status={dueBadgeStatus(due)}>{due.shortLabel}</Badge>
                        : undefined,
                      aside: project?.status ? projectStatusLabels[project.status] : undefined,
                      asideStatus: project?.status,
                    }
                  })}
                  wrap
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {canManage && noteModalOpen && selectedSummary && (
        <TeamNoteModal
          key={selectedSummary.member.id}
          onClose={() => setNoteModalOpen(false)}
          onSave={(note) => addProfileNote(selectedSummary.member, note)}
          summary={selectedSummary}
        />
      )}
    </div>
  )
}
