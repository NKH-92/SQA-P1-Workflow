import { Badge, EmptyState, Rows, Section } from '../components/ui'
import type { RowItem } from '../components/ui/Rows'
import type { AppData, Profile, ProductAssignment } from '../types'
import { dueState } from '../lib/dates'
import { buildAppHash } from '../lib/navigation'
import { compareProducts, productCategory, productCompanyName, productName } from '../lib/products'
import { dueBadgeStatus } from '../features/projects/project.selectors'
import {
  selectMyProductChangeTaskContexts,
  type ProductChangeTaskContext,
} from '../features/change-applications/selectors'
import { ArrowRight, ClipboardList, Package } from 'lucide-react'

/**
 * 파트원의 "내 담당" 화면.
 * 홈(Dashboard)이 "오늘 처리할 것"을 보여준다면, 이 화면은 담당 범위 전체를 참조하는 용도다.
 * 행 자체는 누를 수 없고(누를 수 있는 것처럼 보이지 않게), 처리할 적용 업무가 있는 제품에만
 * ‘적용하러 가기’ 링크를 둔다 — 모든 행이 같은 규칙으로 동작한다.
 */
export function MyWorkPanel({ profile, data }: { profile: Profile; data: AppData }) {
  const ownProducts = data.productAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownDuties = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id)
  const pendingContexts = selectMyProductChangeTaskContexts(data, profile).filter(({ task }) => task.status === 'pending')
  const pendingByProduct = new Map<string, ProductChangeTaskContext[]>()
  for (const context of pendingContexts) {
    const current = pendingByProduct.get(context.task.product_id) ?? []
    current.push(context)
    pendingByProduct.set(context.task.product_id, current)
  }

  const productRow = (assignment: ProductAssignment, fallbackMeta: string): RowItem => {
    const name = productName(assignment)
    const pending = [...(pendingByProduct.get(assignment.product_id) ?? [])]
      .sort((left, right) => left.actionItem.due_date.localeCompare(right.actionItem.due_date))
    const first = pending[0]
    const due = first ? dueState(first.actionItem.due_date) : null
    return {
      title: name,
      meta: productCompanyName(assignment) || fallbackMeta,
      extra: first ? (
        <>
          <Badge status="pending">적용 업무 {pending.length}건</Badge>
          {due && due.kind !== 'none' && <Badge status={dueBadgeStatus(due)}>{due.shortLabel}</Badge>}
        </>
      ) : undefined,
      action: first ? (
        <a
          aria-label={`${name} 적용하러 가기`}
          className="ghost compact my-work-link"
          href={buildAppHash('change-applications', first.application.id)}
        >
          적용하러 가기
          <ArrowRight aria-hidden="true" size={13} />
        </a>
      ) : undefined,
    }
  }

  // 정렬·표기 규칙은 lib/products 공용 헬퍼를 쓴다(파트원 상세 화면과 동일 순서 보장).
  const consignedRows = ownProducts
    .filter((assignment) => productCategory(assignment) === '위탁')
    .sort((left, right) => compareProducts(left, right))
    .map((assignment) => productRow(assignment, '위탁사 없음'))
  const ownCompanyRows = ownProducts
    .filter((assignment) => productCategory(assignment) === '자사')
    .sort((left, right) => compareProducts(left, right))
    // 열 자체가 자사/위탁 구분이므로 회사명이 의미 있을 때만 부제로 남긴다.
    .map((assignment) => productRow(assignment, ''))

  const dutyRows = ownDuties
    .map((assignment) => ({
      title: assignment.duties?.name ?? '이름 없는 업무',
      meta: assignment.duties?.duty_major_categories?.name ?? '대분류 없음',
    }))
    .sort((left, right) => left.meta.localeCompare(right.meta, 'ko') || left.title.localeCompare(right.title, 'ko'))

  const hasNothing = ownProducts.length === 0 && ownDuties.length === 0

  return (
    <div className="stack">
      <div className="page-intro">
        <h1>내 담당</h1>
        <p>
          {hasNothing ? (
            '아직 배정받은 제품이나 업무가 없어요.'
          ) : (
            <>
              담당 제품 <strong>{ownProducts.length}개</strong> · 정기 업무 <strong>{ownDuties.length}개</strong>를 맡고
              있어요.
              {pendingContexts.length > 0 && (
                <>
                  {' '}
                  처리할 적용 업무가 <strong>{pendingContexts.length}건</strong> 있어요.
                </>
              )}
            </>
          )}
        </p>
      </div>

      {hasNothing ? (
        <EmptyState
          icon={<Package size={22} />}
          title="아직 맡은 제품이나 업무가 없어요"
          description="파트장이 담당을 정하면 여기에 모여요. 담당이 필요하면 파트장에게 알려 주세요."
        />
      ) : (
        <div className="grid split-narrow">
          <Section
            title="담당 제품"
            icon={<Package size={18} />}
            aside={`자사 ${ownCompanyRows.length}개 · 위탁 ${consignedRows.length}개`}
          >
            <div className="product-assignment-split">
              <div>
                <h3>자사</h3>
                <Rows rows={ownCompanyRows} empty="담당 중인 자사제품이 없어요." wrap />
              </div>
              <div>
                <h3>위탁</h3>
                <Rows rows={consignedRows} empty="담당 중인 위탁제품이 없어요." wrap />
              </div>
            </div>
          </Section>

          <Section title="담당 업무" icon={<ClipboardList size={18} />} aside={`정기 업무 ${ownDuties.length}개`}>
            <Rows rows={dutyRows} empty="배정된 업무가 없어요. 업무를 받으려면 파트장에게 알려 주세요." wrap />
          </Section>
        </div>
      )}
    </div>
  )
}
