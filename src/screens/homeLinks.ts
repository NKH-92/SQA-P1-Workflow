import type { TabId } from '../app/types'

/** 제품 화면의 ‘담당자 없음’ 필터(useViewState 'products.leader.filter')를 미리 골라 둔다. */
const PRODUCT_FILTER_STORAGE_KEY = 'sqa.view.products.leader.filter'

/** 담당자 없는 제품을 걸러 둔 채로 제품 화면을 연다(기존 화면 홈·전체 화면 사무실 공통). */
export function openUnassignedProducts(setActiveTab: (tab: TabId) => void) {
  try {
    window.sessionStorage.setItem(PRODUCT_FILTER_STORAGE_KEY, JSON.stringify('unassigned'))
  } catch {
    // 저장소를 쓸 수 없으면 필터 없이 제품 화면만 연다.
  }
  setActiveTab('products')
}
