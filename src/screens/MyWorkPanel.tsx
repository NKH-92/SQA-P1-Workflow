import { Rows, Section } from '../components/ui'
import type { AppData, Profile } from '../types'
import { compareProducts, productCategory, productCompanyName, productName } from '../lib/products'
import { ClipboardList, Package } from 'lucide-react'

/**
 * 파트원의 "내 담당" 화면.
 * 홈(Dashboard)이 "오늘 처리할 것"을 보여준다면, 이 화면은 담당 범위 전체를 참조하는 용도다.
 * 두 섹션 모두 아래로 나열되는 목록이므로 나란히 배치한다:
 * 담당제품(자사|위탁 2열, 2fr) 옆에 담당업무(1열, 1fr) — 시각적으로 3등분 리듬.
 */
export function MyWorkPanel({ profile, data }: { profile: Profile; data: AppData }) {
  const ownProducts = data.productAssignments.filter((assignment) => assignment.user_id === profile.id)
  const ownDuties = data.dutyAssignments.filter((assignment) => assignment.user_id === profile.id)

  // 정렬·표기 규칙은 lib/products 공용 헬퍼를 쓴다(파트원 상세 화면과 동일 순서 보장).
  const consignedRows = ownProducts
    .filter((assignment) => productCategory(assignment) === '위탁')
    .sort((left, right) => compareProducts(left, right))
    .map((assignment) => ({
      title: productName(assignment),
      meta: productCompanyName(assignment) || '위탁사 미지정',
    }))
  const ownCompanyRows = ownProducts
    .filter((assignment) => productCategory(assignment) === '자사')
    .sort((left, right) => compareProducts(left, right))
    // 열 자체가 자사/위탁 구분이므로 회사명이 의미 있을 때만 부제로 남긴다.
    .map((assignment) => ({ title: productName(assignment), meta: productCompanyName(assignment) }))

  const dutyRows = ownDuties
    .map((assignment) => ({
      title: assignment.duties?.name ?? assignment.duty_id,
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
            '아직 배정된 담당이 없습니다.'
          ) : (
            <>
              담당제품 <strong>{ownProducts.length}개</strong> · 정기 업무 <strong>{ownDuties.length}개</strong>를 맡고
              있어요.
            </>
          )}
        </p>
      </div>

      <div className="grid split-narrow">
        <Section
          title="담당제품"
          icon={<Package size={18} />}
          aside={`자사 ${ownCompanyRows.length}개 · 위탁 ${consignedRows.length}개`}
        >
          <div className="product-assignment-split">
            <div>
              <h4>자사</h4>
              <Rows rows={ownCompanyRows} empty="담당 중인 자사제품이 없습니다." />
            </div>
            <div>
              <h4>위탁</h4>
              <Rows rows={consignedRows} empty="담당 중인 위탁제품이 없습니다." />
            </div>
          </div>
        </Section>

        <Section title="담당업무" icon={<ClipboardList size={18} />} aside={`정기 업무 ${ownDuties.length}개`}>
          <Rows rows={dutyRows} empty="배정된 담당업무가 없습니다. 파트장에게 문의하세요." />
        </Section>
      </div>
    </div>
  )
}
