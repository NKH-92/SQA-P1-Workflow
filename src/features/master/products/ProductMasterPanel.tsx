import { useEffect, useState } from 'react'
import { Download, Package, Plus, Search, Upload } from 'lucide-react'
import type { ProductCategory } from '../../../types'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import { EmptyState, ReasonPromptModal } from '../../../components/ui'
import { useViewState } from '../../../hooks/useViewState'
import { downloadCsv } from '../../../lib/csv'
import { buildProductAllocationCsvRows } from '../../../lib/productAllocationCsv'
import { parseCsvRows, parseProductImportRows } from '../../../lib/csvImport'
import { quoted, quotedWithJosa, withJosa } from '../../../lib/korean'
import { canManageTeamData, canReceiveAssignment } from '../../../domain/permissions'
import {
  isProductAssigneeFilter,
  matchesProductAssigneeFilter,
  productAssigneeState,
  selectProductGroups,
  selectTransferableProductTasks,
  type ProductAssigneeFilter,
} from '../master.selectors'
import {
  validateProductCreate,
  validateProductImport,
  validateProductUpdate,
} from '../master.validators'
import type { MasterSubPanelProps } from '../shared/types'
import { ImportDiagnostics, type CsvImportIssue } from '../shared/ImportDiagnostics'
import {
  ProductAssignModal,
  UNASSIGNED_PRODUCT_USER_ID,
  type ProductAssignmentForm,
} from './ProductAssignModal'
import { ProductCard, type ProductEdit } from './ProductCard'
import { ProductRegisterModal } from './ProductRegisterModal'
import { useProductAdminController } from './useProductAdminController'

/** 홈의 ‘담당자 배정하기’ 안내가 이 키를 'unassigned'로 바꾼 뒤 이 화면으로 이동한다. 키와 값을 바꾸지 않는다. */
export const PRODUCT_FILTER_VIEW_KEY = 'products.leader.filter'

const emptyAssignment: ProductAssignmentForm = { user_id: '', product_id: '', unassigned_reason: '', transfer_pending_tasks: false }

const FILTER_LABELS: Record<ProductAssigneeFilter, string> = {
  all: '전체',
  unassigned: '담당자 없음',
  inactive: '비활성 담당',
}

export function ProductMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const canManage = canManageTeamData(profile)
  const controller = useProductAdminController(profile, data, setData)
  const [productForm, setProductForm] = useState({ name: '', category: '자사' as ProductCategory, companyName: '자사' })
  const [productAssignment, setProductAssignment] = useState<ProductAssignmentForm>(emptyAssignment)
  const [adminSearch, setAdminSearch] = useViewState<string>('products.leader.query', '', (value): value is string => typeof value === 'string')
  const [assigneeFilter, setAssigneeFilter] = useViewState<ProductAssigneeFilter>(PRODUCT_FILTER_VIEW_KEY, 'all', isProductAssigneeFilter)
  const [pendingDelete, setPendingDelete] = useState<PendingAdminDelete | null>(null)
  const [productEdits, setProductEdits] = useState<Record<string, ProductEdit>>({})
  const [productRegisterOpen, setProductRegisterOpen] = useState(false)
  const [productAssignOpen, setProductAssignOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  // 제품 정보 수정은 저장 전에 변경 사유(감사 이력)를 받는다.
  const [productReasonPrompt, setProductReasonPrompt] = useState<{ productId: string } | null>(null)
  const [productReason, setProductReason] = useState('')
  const [productImportIssues, setProductImportIssues] = useState<CsvImportIssue[]>([])

  const memberOptions = data.profiles.filter(canReceiveAssignment)
  const productName = (productId: string) => data.products.find((item) => item.id === productId)?.name ?? '제품'
  const memberName = (userId: string) => data.profiles.find((item) => item.id === userId)?.name ?? '담당자'

  const run = async (operation: () => Promise<boolean>) => {
    setSaving(true)
    try {
      return await operation()
    } finally {
      setSaving(false)
    }
  }

  const editProductAssignment = (productId: string) => {
    const product = data.products.find((item) => item.id === productId)
    const assignment = data.productAssignments.find((item) => item.product_id === productId)
    setProductAssignment({
      product_id: productId,
      user_id: assignment?.user_id ?? UNASSIGNED_PRODUCT_USER_ID,
      previous_user_id: assignment?.user_id,
      expected_updated_at: product?.updated_at ?? null,
      unassigned_reason: assignment ? '' : product?.unassigned_reason ?? '',
      transfer_pending_tasks: false,
    })
    setProductAssignOpen(true)
  }
  const query = adminSearch.trim()
  const { ownCompanyProducts, consignedProducts, unassignedProducts } = selectProductGroups(data, query)
  const filterCounts: Record<ProductAssigneeFilter, number> = {
    all: data.products.length,
    unassigned: unassignedProducts.length,
    inactive: data.products.filter((product) => productAssigneeState(data, product.id) === 'inactive').length,
  }
  const visibleOwnProducts = ownCompanyProducts.filter((product) => matchesProductAssigneeFilter(data, product.id, assigneeFilter))
  const visibleConsignedProducts = consignedProducts.filter((product) => matchesProductAssigneeFilter(data, product.id, assigneeFilter))
  const filtersApplied = assigneeFilter !== 'all' || Boolean(query)

  useEffect(() => {
    setPendingDelete(null)
  }, [adminSearch, assigneeFilter])

  const importProductsCsv = async (file: File) => {
    setProductImportIssues([])
    let rows: ReturnType<typeof parseProductImportRows>
    try {
      rows = parseProductImportRows(parseCsvRows(await file.text()))
    } catch (error) {
      // 파일 읽기·파싱 실패도 다른 실패와 같은 경로(오류 토스트)로 보여준다.
      await mutate(async () => {
        throw error
      }, '')
      return
    }
    const existingNames = new Set(data.products.map((item) => item.name.trim().toLowerCase()))
    const seen = new Set<string>()
    const issues: CsvImportIssue[] = []
    const incoming = rows
      .filter((row, index) => {
        const extra = row as { category?: string }
        if (!row.name.trim()) {
          issues.push({ value: `${index + 1}번째 행`, reason: '제품명이 비어 있어요.' })
          return false
        }
        // 구분값이 있는데 자사/위탁이 아니면 해당 값과 사유를 결과 패널에 남긴다.
        if (extra.category && extra.category !== '자사' && extra.category !== '위탁') {
          issues.push({ value: row.name, reason: `구분은 ‘자사’나 ‘위탁’으로 적어 주세요. (입력값: ${extra.category})` })
          return false
        }
        const key = row.name.trim().toLowerCase()
        if (existingNames.has(key)) {
          issues.push({ value: row.name, reason: '이미 있는 제품명이에요.' })
          return false
        }
        if (seen.has(key)) {
          issues.push({ value: row.name, reason: 'CSV 파일 안에 같은 제품명이 두 번 있어요.' })
          return false
        }
        seen.add(key)
        return true
      })
      .map((row) => {
        const extra = row as { category?: string; companyName?: string }
        return {
          name: row.name,
          companyName: extra.companyName,
          // 빈 구분(열 없음 포함)만 '자사' 기본값을 준다. 그 외 값은 위에서 걸러졌다.
          category: extra.category === '위탁' ? '위탁' : '자사',
        }
      })
    setProductImportIssues(issues)
    await mutate(
      async () => {
        validateProductImport(data, rows.length, incoming.length)
        await controller.importRows(incoming)
      },
      issues.length > 0
        ? `제품 ${incoming.length}개를 가져왔어요. 가져오지 않은 ${issues.length}개는 아래 결과에서 확인해 주세요.`
        : `제품 ${incoming.length}개를 가져왔어요.`,
    )
  }

  const addProduct = async () => {
    let createdName = ''
    const ok = await run(() => mutate(async () => {
      const payload = validateProductCreate(data, productForm)
      await controller.add(payload)
      createdName = payload.name
      setProductForm({ name: '', category: '자사', companyName: '자사' })
    }, () => `${quotedWithJosa(createdName, '을/를')} 등록했어요.`))
    if (ok) setProductRegisterOpen(false)
  }

  /**
   * 담당자 저장은 한 번에 끝낸다. 담당자를 바꾸면서 미완료 적용 업무도 넘기기로 했다면
   * 담당자 교체 → 업무 넘기기를 한 저장 안에서 차례로 처리한다(다시 열어 한 번 더 저장할 필요가 없다).
   */
  const assignProduct = async () => {
    const form = productAssignment
    if (!form.product_id || !form.user_id) return
    const name = productName(form.product_id)
    if (form.user_id === UNASSIGNED_PRODUCT_USER_ID) {
      const reason = form.unassigned_reason.trim()
      if (!reason) return
      let noop = false
      const ok = await run(() => mutate(async () => {
        const result = await controller.saveAssignments({
          productId: form.product_id,
          nextMemberIds: [],
          unassignedReason: reason,
          reason,
          expectedUpdatedAt: form.expected_updated_at,
        })
        noop = result.noop
        setProductAssignment(emptyAssignment)
      }, () => noop ? '바뀐 내용이 없어요.' : `${withJosa(name, '은/는')} 이제 담당자가 없어요.`))
      if (ok) setProductAssignOpen(false)
      return
    }
    const transferCount = form.transfer_pending_tasks
      ? selectTransferableProductTasks(data, form.product_id, form.user_id).length
      : 0
    const currentIds = data.productAssignments
      .filter((item) => item.product_id === form.product_id)
      .map((item) => item.user_id)
    const replacing = form.user_id !== form.previous_user_id
    const needsReplacement = replacing && !currentIds.includes(form.user_id)
    // 서버가 실제로 바뀌었는지(중복 배정 여부)를 정한다. 토스트 문구는 그 결과를 본 뒤에 고른다.
    let noop = false
    const ok = await run(() => mutate(async () => {
      let changed = false
      if (needsReplacement) {
        const result = await controller.saveAssignments({
          productId: form.product_id,
          nextMemberIds: [...new Set([
            ...currentIds.filter((userId) => userId !== form.previous_user_id),
            form.user_id,
          ])],
          reason: '제품 카드에서 담당자 변경',
          expectedUpdatedAt: form.expected_updated_at,
        })
        changed = !result.noop
      }
      if (form.transfer_pending_tasks) {
        const result = await controller.assign({
          userId: form.user_id,
          productId: form.product_id,
          transferPendingChangeTasks: true,
          transferReason: '제품 담당자를 바꾸면서 미완료 적용 업무도 넘겨요',
        })
        changed = changed || !result.noop
      }
      noop = !changed
      setProductAssignment(emptyAssignment)
    }, () => noop
      ? '이미 배정한 담당자예요.'
      : transferCount > 0
        ? `${name} 담당자를 ${memberName(form.user_id)}님으로 정하고 미완료 적용 업무 ${transferCount}건을 넘겼어요.`
        : `${name} 담당자를 ${memberName(form.user_id)}님으로 정했어요.`))
    if (ok) setProductAssignOpen(false)
  }

  const saveProductEdit = (productId: string, reason: string) => {
    let noop = false
    let savedName = productName(productId)
    return mutate(async () => {
      const edit = productEdits[productId]
      if (!edit?.name.trim()) return
      const product = data.products.find((item) => item.id === productId)
      if (!product) return
      const name = validateProductUpdate(data, productId, edit.name)
      savedName = name
      const result = await controller.update(productId, {
        name,
        category: edit.category || '자사',
        company_name: edit.category === '자사' ? '자사' : edit.companyName.trim(),
        unassigned_reason: data.productAssignments.some((assignment) => assignment.product_id === productId)
          ? null
          : edit.unassignedReason.trim() || null,
        sort_order: product.sort_order ?? null,
        expectedUpdatedAt: edit.expectedUpdatedAt,
        reason,
      })
      noop = result.noop
      setProductEdits((current) => {
        const next = { ...current }
        delete next[productId]
        return next
      })
    }, () => noop ? '바뀐 내용이 없어요.' : `${quoted(savedName)} 제품 정보를 수정했어요.`)
  }

  const confirmProductReasonPrompt = async () => {
    if (!productReasonPrompt) return
    const ok = await run(() => saveProductEdit(productReasonPrompt.productId, productReason))
    if (ok) {
      setProductReasonPrompt(null)
      setProductReason('')
    }
  }

  const deleteProduct = (productId: string, input: AuditedDeleteInput) => {
    const name = productName(productId)
    return mutate(async () => {
      await controller.remove(productId, input)
      setPendingDelete(null)
    }, `${quotedWithJosa(name, '을/를')} 삭제했어요.`)
  }

  const renderColumn = (title: string, products: typeof visibleOwnProducts, emptyTitle: string) => (
    <section className="master-product-column">
      <header className="master-product-column-head">
        <h2>{title}</h2>
        <span>{products.length}개</span>
      </header>
      <div className="master-product-list">
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            data={data}
            productEdits={productEdits}
            setProductEdits={setProductEdits}
            onSave={(productId) => setProductReasonPrompt({ productId })}
            pendingDelete={pendingDelete}
            setPendingDelete={setPendingDelete}
            onDelete={deleteProduct}
            onAssign={editProductAssignment}
            readOnly={!canManage}
          />
        ))}
        {products.length === 0 && (
          <EmptyState
            icon={<Package size={20} />}
            title={filtersApplied ? `조건에 맞는 ${withJosa(emptyTitle, '이/가')} 없어요` : `${withJosa(emptyTitle, '이/가')} 없어요`}
            description={filtersApplied ? '검색어나 필터를 바꿔 보세요.' : canManage ? '제품을 등록하면 담당자를 배정할 수 있어요.' : undefined}
            action={filtersApplied
              ? <button className="ghost compact" onClick={() => { setAdminSearch(''); setAssigneeFilter('all') }} type="button">검색·필터 지우기</button>
              : canManage
                ? <button className="ghost compact" onClick={() => setProductRegisterOpen(true)} type="button"><Plus size={14} />제품 등록</button>
                : undefined}
          />
        )}
      </div>
    </section>
  )

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <div>
          <h1>제품</h1>
          <p>등록 {data.products.length}개 · 담당자 없음 {unassignedProducts.length}개</p>
        </div>
        {canManage && (
          <button className="primary" onClick={() => setProductRegisterOpen(true)} type="button">
            <Plus size={16} />
            제품 등록
          </button>
        )}
      </div>
      <div className="admin-header master-header">
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="제품 검색"
            placeholder="제품명·구분·위탁사 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={() => downloadCsv('product-allocations.csv', buildProductAllocationCsvRows(data))} type="button">
          <Download size={16} />
          CSV 내려받기
        </button>
        {canManage && <label className="ghost file-import-btn">
          <Upload size={16} />
          CSV 가져오기
          <input
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (!file) return
              void importProductsCsv(file)
              event.target.value = ''
            }}
            type="file"
          />
        </label>}
      </div>
      <div className="filter-chip-row master-filter-chips" role="group" aria-label="담당 상태로 거르기">
        {(['all', 'unassigned', 'inactive'] as const).map((filter) => (
          <button
            aria-pressed={assigneeFilter === filter}
            className={assigneeFilter === filter ? 'filter-chip selected' : 'filter-chip'}
            key={filter}
            onClick={() => setAssigneeFilter(filter)}
            type="button"
          >
            {FILTER_LABELS[filter]} <span className="filter-chip-count">{filterCounts[filter]}</span>
          </button>
        ))}
      </div>

      <ImportDiagnostics
        id="product-import-result-title"
        subject="제품"
        issues={productImportIssues}
        onClose={() => setProductImportIssues([])}
      />

      <div className="master-product-split">
        {renderColumn('자사제품', visibleOwnProducts, '자사제품')}
        {renderColumn('위탁제품', visibleConsignedProducts, '위탁제품')}
      </div>

      <ProductRegisterModal
        open={productRegisterOpen}
        onClose={() => setProductRegisterOpen(false)}
        productForm={productForm}
        setProductForm={setProductForm}
        onSubmit={() => void addProduct()}
        submitting={saving}
      />
      <ProductAssignModal
        fixedProduct
        open={productAssignOpen}
        onClose={() => {
          setProductAssignOpen(false)
          setProductAssignment(emptyAssignment)
        }}
        data={data}
        memberOptions={memberOptions}
        productAssignment={productAssignment}
        setProductAssignment={setProductAssignment}
        onSubmit={() => void assignProduct()}
        submitting={saving}
      />
      <ReasonPromptModal
        open={productReasonPrompt !== null}
        onClose={() => {
          setProductReasonPrompt(null)
          setProductReason('')
        }}
        title="제품 정보를 바꿀까요?"
        description="변경 사유는 감사 이력에 남아요. 다른 파트장도 볼 수 있어요."
        reason={productReason}
        setReason={setProductReason}
        onSubmit={() => void confirmProductReasonPrompt()}
        submitLabel="저장하기"
        placeholder="예: 위탁사 이름을 바로잡아요."
        submitting={saving}
      />
    </div>
  )
}
