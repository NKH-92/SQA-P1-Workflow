import { useEffect, useState } from 'react'
import { Download, Package, Search, Upload, Users } from 'lucide-react'
import type { ProductCategory } from '../../../types'
import type { AdminDeleteTable } from '../../../app/types'
import { downloadCsv } from '../../../lib/csv'
import { buildProductAllocationCsvRows } from '../../../lib/productAllocationCsv'
import { parseCsvRows, parseProductImportRows } from '../../../lib/csvImport'
import { canReceiveAssignment } from '../../../domain/permissions'
import {
  addProduct as addProductMutation,
  assignProduct as assignProductMutation,
  createRepositoryContext,
  deleteProduct as deleteProductRecord,
  importProducts as importProductsMutation,
  updateProduct as updateProductMutation,
} from '../../../data'
import { selectProductGroups } from '../master.selectors'
import {
  validateProductAssignment,
  validateProductCreate,
  validateProductImport,
  validateProductUpdate,
} from '../master.validators'
import type { MasterSubPanelProps } from '../shared/types'
import { ProductAssignModal } from './ProductAssignModal'
import { ProductCard } from './ProductCard'
import { ProductRegisterModal } from './ProductRegisterModal'

export function ProductMasterPanel({ profile, data, mutate, setData }: MasterSubPanelProps) {
  const [productForm, setProductForm] = useState({ name: '', category: '자사' as ProductCategory, companyName: '자사' })
  const [productAssignment, setProductAssignment] = useState({ user_id: '', product_id: '' })
  const [adminSearch, setAdminSearch] = useState('')
  const [pendingDelete, setPendingDelete] = useState<{ table: AdminDeleteTable; id: string } | null>(null)
  const [productEdits, setProductEdits] = useState<
    Record<string, { name: string; category: ProductCategory | string; companyName: string }>
  >({})
  const [productRegisterOpen, setProductRegisterOpen] = useState(false)
  const [productAssignOpen, setProductAssignOpen] = useState(false)

  const memberOptions = data.profiles.filter(canReceiveAssignment)
  const query = adminSearch.trim()
  const { ownCompanyProducts, consignedProducts, unassignedProducts } = selectProductGroups(data, query)

  useEffect(() => {
    setPendingDelete(null)
  }, [adminSearch])

  const importProductsCsv = (file: File) =>
    mutate(async () => {
      const rows = parseProductImportRows(parseCsvRows(await file.text()))
      const existingNames = new Set(data.products.map((item) => item.name.trim().toLowerCase()))
      const incoming = rows.filter((row) => !existingNames.has(row.name.trim().toLowerCase()))
      validateProductImport(data, rows.length, incoming.length)
      await importProductsMutation(createRepositoryContext(profile, data, setData), incoming)
    }, '제품 CSV 가져오기를 완료했습니다.')

  const addProduct = async () => {
    const ok = await mutate(async () => {
      const payload = validateProductCreate(data, productForm)
      await addProductMutation(createRepositoryContext(profile, data, setData), payload)
      setProductForm({ name: '', category: '자사', companyName: '자사' })
    }, '제품을 등록했습니다.')
    if (ok) setProductRegisterOpen(false)
  }

  const assignProduct = async () => {
    const ok = await mutate(async () => {
      if (!productAssignment.user_id) return
      validateProductAssignment(data, productAssignment.user_id, productAssignment.product_id)
      await assignProductMutation(createRepositoryContext(profile, data, setData), {
        userId: productAssignment.user_id,
        productId: productAssignment.product_id,
      })
      setProductAssignment({ user_id: productAssignment.user_id, product_id: '' })
    }, '담당 제품을 배정했습니다.')
    if (ok) setProductAssignOpen(false)
  }

  const saveProductEdit = (productId: string) =>
    mutate(async () => {
      const edit = productEdits[productId]
      if (!edit?.name.trim()) return
      const name = validateProductUpdate(data, productId, edit.name)
      await updateProductMutation(createRepositoryContext(profile, data, setData), productId, {
        name,
        category: edit.category || '자사',
        company_name: edit.companyName.trim() || (edit.category === '자사' ? '자사' : ''),
      })
      setProductEdits((current) => {
        const next = { ...current }
        delete next[productId]
        return next
      })
    }, '제품 정보를 수정했습니다.')

  const deleteProduct = (productId: string) =>
    mutate(async () => {
      await deleteProductRecord(createRepositoryContext(profile, data, setData), productId)
      setPendingDelete(null)
    }, '제품 삭제했습니다.')

  return (
    <div className="stack">
      <div className="page-intro master-page-heading">
        <span>Master / Products</span>
        <h1>제품 마스터</h1>
        <p>
          등록 {data.products.length}개 · 미배정 {unassignedProducts.length}개
        </p>
      </div>
      <div className="admin-header master-header">
        <div className="master-header-actions">
          <button className="primary" onClick={() => setProductRegisterOpen(true)} type="button">
            <Package size={16} />
            제품 등록
          </button>
          <button className="ghost" onClick={() => setProductAssignOpen(true)} type="button">
            <Users size={16} />
            제품 배정
          </button>
        </div>
        <label className="search-field">
          <Search size={16} />
          <input
            placeholder="이름, 제품, 업무 검색"
            value={adminSearch}
            onChange={(event) => setAdminSearch(event.target.value)}
          />
        </label>
        <button className="ghost" onClick={() => downloadCsv('product-allocations.csv', buildProductAllocationCsvRows(data))} type="button">
          <Download size={16} />
          CSV
        </button>
        <label className="ghost file-import-btn">
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
        </label>
      </div>

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
                onSave={(productId) => void saveProductEdit(productId)}
                pendingDelete={pendingDelete}
                setPendingDelete={setPendingDelete}
                onDelete={deleteProduct}
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
                onSave={(productId) => void saveProductEdit(productId)}
                pendingDelete={pendingDelete}
                setPendingDelete={setPendingDelete}
                onDelete={deleteProduct}
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
    </div>
  )
}
