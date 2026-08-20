import { useEffect, useState } from 'react'
import { Download, Package, Search, Upload, Users } from 'lucide-react'
import type { ProductCategory } from '../../../types'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import { ReasonPromptModal } from '../../../components/ui'
import { downloadCsv } from '../../../lib/csv'
import { buildProductAllocationCsvRows } from '../../../lib/productAllocationCsv'
import { parseCsvRows, parseProductImportRows } from '../../../lib/csvImport'
import { canManageTeamData, canReceiveAssignment } from '../../../domain/permissions'
import { selectProductGroups } from '../master.selectors'
import { selectProductChangeTaskContexts } from '../../change-applications/selectors'
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

export function ProductMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const canManage = canManageTeamData(profile)
  const controller = useProductAdminController(profile, data, setData)
  const [productForm, setProductForm] = useState({ name: '', category: '자사' as ProductCategory, companyName: '자사' })
  const [productAssignment, setProductAssignment] = useState<ProductAssignmentForm>({
    user_id: '',
    product_id: '',
    unassigned_reason: '',
    transfer_pending_tasks: false,
  })
  const [adminSearch, setAdminSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<PendingAdminDelete | null>(null)
  const [productEdits, setProductEdits] = useState<Record<string, ProductEdit>>({})
  const [productRegisterOpen, setProductRegisterOpen] = useState(false)
  const [productAssignOpen, setProductAssignOpen] = useState(false)
  // Reason-required update / unassign: Save opens this prompt instead of writing directly.
  const [productReasonPrompt, setProductReasonPrompt] = useState<
    { kind: 'update'; productId: string } | { kind: 'unassign' } | null
  >(null)
  const [productReason, setProductReason] = useState('')
  const [productImportIssues, setProductImportIssues] = useState<CsvImportIssue[]>([])

  const memberOptions = data.profiles.filter(canReceiveAssignment)
  const query = adminSearch.trim()
  const { ownCompanyProducts, consignedProducts, unassignedProducts } = selectProductGroups(data, query)

  useEffect(() => {
    setPendingDelete(null)
  }, [adminSearch])

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
          issues.push({ value: `데이터 행 ${index + 1}`, reason: '제품명이 비어 있습니다.' })
          return false
        }
        // 구분값이 있는데 자사/위탁이 아니면 해당 값과 사유를 결과 패널에 남긴다.
        if (extra.category && extra.category !== '자사' && extra.category !== '위탁') {
          issues.push({ value: row.name, reason: `구분 '${extra.category}'은 자사 또는 위탁이어야 합니다.` })
          return false
        }
        const key = row.name.trim().toLowerCase()
        if (existingNames.has(key)) {
          issues.push({ value: row.name, reason: '이미 등록된 제품명입니다.' })
          return false
        }
        if (seen.has(key)) {
          issues.push({ value: row.name, reason: 'CSV 파일 안에서 제품명이 중복되었습니다.' })
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
        ? `제품 ${incoming.length}건을 가져왔습니다. 제외 ${issues.length}건은 화면의 가져오기 결과에서 확인해 주세요.`
        : `제품 ${incoming.length}건을 가져왔습니다.`,
    )
  }

  const addProduct = async () => {
    const ok = await mutate(async () => {
      const payload = validateProductCreate(data, productForm)
      await controller.add(payload)
      setProductForm({ name: '', category: '자사', companyName: '자사' })
    }, '제품을 등록했습니다.')
    if (ok) setProductRegisterOpen(false)
  }

  const assignProduct = async () => {
    if (!productAssignment.user_id || !productAssignment.product_id) return
    if (productAssignment.user_id === UNASSIGNED_PRODUCT_USER_ID) {
      setProductAssignOpen(false)
      setProductReasonPrompt({ kind: 'unassign' })
      return
    }
    const transferCount = productAssignment.transfer_pending_tasks
      ? selectProductChangeTaskContexts(data).filter(
          ({ task, application }) =>
            task.product_id === productAssignment.product_id
            && task.status === 'pending'
            && task.assignee_id !== productAssignment.user_id
            && application.status === 'published',
        ).length
      : 0
    // The server (not the local cache) decides whether this is a real change or a
    // pre-existing duplicate no-op; the toast text is resolved after that result
    // is known, not when mutate() is called.
    let noop = false
    const ok = await mutate(async () => {
      const result = await controller.assign({
        userId: productAssignment.user_id,
        productId: productAssignment.product_id,
        transferPendingChangeTasks: productAssignment.transfer_pending_tasks,
        transferReason: productAssignment.transfer_pending_tasks
          ? '제품 담당자 배정 변경에 따른 미완료 적용업무 이관'
          : undefined,
      })
      noop = result.noop
      setProductAssignment({ user_id: '', product_id: '', unassigned_reason: '', transfer_pending_tasks: false })
    }, () => noop
      ? '이미 배정되어 있습니다.'
      : transferCount > 0
        ? `담당 제품을 배정하고 미완료 적용업무 ${transferCount}건을 이관했습니다.`
        : '담당 제품을 배정했습니다.')
    if (ok) setProductAssignOpen(false)
  }

  const confirmUnassignProduct = async (reason: string) => {
    const ok = await mutate(async () => {
      if (!productAssignment.product_id) return
      await controller.saveAssignments({
        productId: productAssignment.product_id,
        nextMemberIds: [],
        unassignedReason: productAssignment.unassigned_reason,
        reason,
      })
      setProductAssignment({ user_id: '', product_id: '', unassigned_reason: '', transfer_pending_tasks: false })
    }, '제품을 미지정 상태로 저장했습니다.')
    if (ok) {
      setProductReasonPrompt(null)
      setProductReason('')
    }
  }

  const saveProductEdit = (productId: string, reason: string) => {
    let noop = false
    return mutate(async () => {
      const edit = productEdits[productId]
      if (!edit?.name.trim()) return
      const product = data.products.find((item) => item.id === productId)
      if (!product) return
      const name = validateProductUpdate(data, productId, edit.name)
      const result = await controller.update(productId, {
        name,
        category: edit.category || '자사',
        company_name: edit.companyName.trim() || (edit.category === '자사' ? '자사' : ''),
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
    }, () => noop ? '변경된 내용이 없습니다.' : '제품 정보를 수정했습니다.')
  }

  const confirmProductReasonPrompt = async () => {
    if (!productReasonPrompt) return
    if (productReasonPrompt.kind === 'unassign') {
      await confirmUnassignProduct(productReason)
      return
    }
    const ok = await saveProductEdit(productReasonPrompt.productId, productReason)
    if (ok) {
      setProductReasonPrompt(null)
      setProductReason('')
    }
  }

  const deleteProduct = (productId: string, input: AuditedDeleteInput) =>
    mutate(async () => {
      await controller.remove(productId, input)
      setPendingDelete(null)
    }, '제품 삭제했습니다.')

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <h1>제품 마스터</h1>
        <p>
          등록 {data.products.length}개 · 미배정 {unassignedProducts.length}개
        </p>
      </div>
      <div className="admin-header master-header">
        {canManage && <div className="master-header-actions">
          <button className="primary" onClick={() => setProductRegisterOpen(true)} type="button">
            <Package size={16} />
            제품 등록
          </button>
          <button className="ghost" onClick={() => setProductAssignOpen(true)} type="button">
            <Users size={16} />
            제품 배정
          </button>
        </div>}
        <label className="search-field">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label="제품 검색"
            placeholder="이름, 제품, 업무 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={() => downloadCsv('product-allocations.csv', buildProductAllocationCsvRows(data))} type="button">
          <Download size={16} />
          CSV
        </button>
        {canManage && <label className="ghost file-import-btn">
          <Upload size={16} />
          가져오기
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

      <ImportDiagnostics
        id="product-import-result-title"
        subject="제품"
        issues={productImportIssues}
        onClose={() => setProductImportIssues([])}
      />

      <div className="master-product-split">
        <section className="master-product-column">
          <header className="master-product-column-head">
            <h3>자사제품</h3>
            <span>{ownCompanyProducts.length}개</span>
          </header>
          <div className="master-product-list">
            {ownCompanyProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                data={data}
                productEdits={productEdits}
                setProductEdits={setProductEdits}
                onSave={(productId) => setProductReasonPrompt({ kind: 'update', productId })}
                pendingDelete={pendingDelete}
                setPendingDelete={setPendingDelete}
                onDelete={deleteProduct}
                readOnly={!canManage}
              />
            ))}
            {ownCompanyProducts.length === 0 && <p className="empty">자사제품이 없습니다.</p>}
          </div>
        </section>
        <section className="master-product-column">
          <header className="master-product-column-head">
            <h3>위탁제품</h3>
            <span>{consignedProducts.length}개</span>
          </header>
          <div className="master-product-list">
            {consignedProducts.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                data={data}
                productEdits={productEdits}
                setProductEdits={setProductEdits}
                onSave={(productId) => setProductReasonPrompt({ kind: 'update', productId })}
                pendingDelete={pendingDelete}
                setPendingDelete={setPendingDelete}
                onDelete={deleteProduct}
                readOnly={!canManage}
              />
            ))}
            {consignedProducts.length === 0 && <p className="empty">위탁제품이 없습니다.</p>}
          </div>
        </section>
      </div>

      <ProductRegisterModal
        open={productRegisterOpen}
        onClose={() => setProductRegisterOpen(false)}
        productForm={productForm}
        setProductForm={setProductForm}
        onSubmit={addProduct}
      />
      <ProductAssignModal
        open={productAssignOpen}
        onClose={() => setProductAssignOpen(false)}
        data={data}
        memberOptions={memberOptions}
        productAssignment={productAssignment}
        setProductAssignment={setProductAssignment}
        onSubmit={assignProduct}
      />
      <ReasonPromptModal
        open={productReasonPrompt !== null}
        onClose={() => {
          setProductReasonPrompt(null)
          setProductReason('')
        }}
        title={productReasonPrompt?.kind === 'unassign' ? '제품 배정 해제 사유' : '제품 정보 변경 사유'}
        description="다른 사용자도 확인할 수 있는 변경 사유를 남겨 주세요."
        reason={productReason}
        setReason={setProductReason}
        onSubmit={() => void confirmProductReasonPrompt()}
        submitLabel={productReasonPrompt?.kind === 'unassign' ? '미지정 저장' : '수정 저장'}
      />
    </div>
  )
}
