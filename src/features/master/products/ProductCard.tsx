import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Save } from 'lucide-react'
import type { AppData, ProductCategory } from '../../../types'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'

export type ProductEdit = {
  name: string
  category: ProductCategory | string
  companyName: string
  unassignedReason: string
  /** Revision snapshotted when the editor opened and sent back as the OCC check. */
  expectedUpdatedAt: string | null
}

export function ProductCard({
  product,
  data,
  productEdits,
  setProductEdits,
  onSave,
  pendingDelete,
  setPendingDelete,
  onDelete,
  readOnly = false,
}: {
  product: AppData['products'][number]
  data: AppData
  productEdits: Record<string, ProductEdit>
  setProductEdits: Dispatch<SetStateAction<Record<string, ProductEdit>>>
  onSave: (productId: string) => void
  pendingDelete: PendingAdminDelete | null
  setPendingDelete: (value: PendingAdminDelete | null) => void
  onDelete: (productId: string, input: AuditedDeleteInput) => void
  readOnly?: boolean
}) {
  const assignments = data.productAssignments.filter((assignment) => assignment.product_id === product.id)
  const edit = productEdits[product.id]

  return (
    <article className={assignments.length === 0 ? 'master-card unassigned' : 'master-card'}>
      {edit && !readOnly ? (
        <div className="project-edit-form">
          <label>
            제품명
            <input
              value={edit.name}
              onChange={(event) =>
                setProductEdits({ ...productEdits, [product.id]: { ...edit, name: event.target.value } })
              }
            />
          </label>
          <label>
            구분
            <select
              value={edit.category}
              onChange={(event) => {
                const category = event.target.value as ProductCategory
                setProductEdits({
                  ...productEdits,
                  [product.id]: {
                    ...edit,
                    category,
                    companyName: category === '자사' ? '자사' : edit.companyName === '자사' ? '' : edit.companyName,
                  },
                })
              }}
            >
              <option value="자사">자사</option>
              <option value="위탁">위탁</option>
            </select>
          </label>
          <label>
            위탁사명
            <input
              value={edit.companyName}
              onChange={(event) =>
                setProductEdits({ ...productEdits, [product.id]: { ...edit, companyName: event.target.value } })
              }
            />
          </label>
          {assignments.length === 0 && (
            <label className="wide">
              비고 · 담당자 미지정 사유 (선택)
              <textarea
                maxLength={1000}
                placeholder="예: 담당 제품군 조정 중"
                value={edit.unassignedReason}
                onChange={(event) =>
                  setProductEdits({
                    ...productEdits,
                    [product.id]: { ...edit, unassignedReason: event.target.value },
                  })
                }
              />
              <small>{edit.unassignedReason.length}/1000자</small>
            </label>
          )}
          <div className="inline-actions">
            <button className="primary compact" disabled={!edit.name.trim()} onClick={() => onSave(product.id)} type="button">
              <Save size={16} />
              저장
            </button>
            <button
              className="ghost compact"
              onClick={() =>
                setProductEdits((current) => {
                  const next = { ...current }
                  delete next[product.id]
                  return next
                })
              }
              type="button"
            >
              취소
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="master-card-head">
            <div>
              <h3>{product.name}</h3>
              <p>
                {product.category ?? '자사'} · {product.company_name ?? '회사명 없음'}
              </p>
            </div>
            {!readOnly && <div className="group-actions">
              <button
                className="ghost compact"
                onClick={() =>
                  setProductEdits({
                    ...productEdits,
                    [product.id]: {
                      name: product.name,
                      category: product.category ?? '자사',
                      companyName: product.company_name ?? (product.category === '자사' ? '자사' : ''),
                      unassignedReason: product.unassigned_reason ?? '',
                      expectedUpdatedAt: product.updated_at ?? null,
                    },
                  })
                }
                title="제품 수정"
                type="button"
              >
                <Pencil size={16} />
              </button>
              <DeleteConfirmAction
                table="products"
                id={product.id}
                expectedUpdatedAt={product.updated_at}
                label="제품"
                itemName={product.name}
                warning={
                  assignments.length > 0 ? `배정 ${assignments.length}건이 함께 삭제됩니다.` : undefined
                }
                pendingDelete={pendingDelete}
                setPendingDelete={setPendingDelete}
                onConfirm={(input) => onDelete(product.id, input)}
              />
            </div>}
          </div>
          <div className="pill-row">
            {assignments.map((assignment) => (
              <span
                className={data.profiles.find((profile) => profile.id === assignment.user_id)?.is_active === false
                  ? 'pill-warn'
                  : undefined}
                key={assignment.id}
                title={data.profiles.find((profile) => profile.id === assignment.user_id)?.is_active === false
                  ? '담당자 비활성 · 재배정 필요'
                  : undefined}
              >
                {assignment.profiles?.name ?? assignment.user_id}
                {data.profiles.find((profile) => profile.id === assignment.user_id)?.is_active === false
                  ? ' · 비활성'
                  : ''}
              </span>
            ))}
            {assignments.length === 0 && <span className="pill-warn">미지정</span>}
          </div>
          {assignments.length === 0 && (
            <p className="product-unassigned-note">
              <strong>비고</strong>
              {product.unassigned_reason || '담당자 미지정 사유가 입력되지 않았습니다.'}
            </p>
          )}
        </>
      )}
    </article>
  )
}
