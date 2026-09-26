import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Trash2, UserPlus, UserRoundCog } from 'lucide-react'
import { OverflowMenu } from '../../../components/ui'
import type { AppData, ProductCategory } from '../../../types'
import type { PendingAdminDelete } from '../../../app/types'
import type { AuditedDeleteInput } from '../../../data/contracts'
import { DeleteConfirmAction } from '../shared/DeleteConfirmAction'
import { masterDeleteWarnings } from '../shared/deleteCopy'

export type ProductEdit = {
  name: string
  category: ProductCategory | string
  companyName: string
  unassignedReason: string
  /** Revision snapshotted when the editor opened and sent back as the OCC check. */
  expectedUpdatedAt: string | null
}

/** 카드 부제: 자사제품은 ‘자사’만, 위탁제품은 위탁사 이름까지. */
function productOriginLabel(product: Pick<AppData['products'][number], 'category' | 'company_name'>) {
  if (product.category === '위탁') return `위탁 · ${product.company_name?.trim() || '위탁사 없음'}`
  return '자사'
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
  onAssign,
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
  onAssign?: (productId: string) => void
  readOnly?: boolean
}) {
  const assignments = data.productAssignments.filter((assignment) => assignment.product_id === product.id)
  const edit = productEdits[product.id]
  const isInactive = (userId: string) => data.profiles.find((profile) => profile.id === userId)?.is_active === false
  const hasInactiveAssignee = assignments.some((assignment) => isInactive(assignment.user_id))
  const needsAssignee = assignments.length === 0 || hasInactiveAssignee

  const startEdit = () =>
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

  const closeEdit = () =>
    setProductEdits((current) => {
      const next = { ...current }
      delete next[product.id]
      return next
    })

  return (
    <article className={needsAssignee ? 'master-card unassigned' : 'master-card'} data-product-id={product.id}>
      {edit && !readOnly ? (
        <div className="project-edit-form product-edit-form">
          <label>
            제품명
            <input
              autoFocus
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
          {edit.category === '위탁' && (
            <label>
              위탁사명
              <input
                placeholder="예: 위탁사 A"
                value={edit.companyName}
                onChange={(event) =>
                  setProductEdits({ ...productEdits, [product.id]: { ...edit, companyName: event.target.value } })
                }
              />
            </label>
          )}
          {assignments.length === 0 && (
            <label className="wide">
              담당자가 없는 이유 <small>선택</small>
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
            <button className="ghost compact" onClick={closeEdit} type="button">
              닫기
            </button>
            <button className="primary compact" disabled={!edit.name.trim()} onClick={() => onSave(product.id)} type="button">
              저장
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="master-card-head">
            <div>
              <h3>{product.name}</h3>
              <p>{productOriginLabel(product)}</p>
            </div>
            {!readOnly && (
              <OverflowMenu
                label={`${product.name} 더보기`}
                items={[
                  { label: '제품 정보 수정', icon: <Pencil aria-hidden="true" size={15} />, onSelect: startEdit },
                  {
                    label: '제품 삭제',
                    icon: <Trash2 aria-hidden="true" size={15} />,
                    danger: true,
                    onSelect: () => setPendingDelete({
                      table: 'products',
                      id: product.id,
                      expectedUpdatedAt: product.updated_at ?? null,
                    }),
                  },
                ]}
              />
            )}
          </div>
          <div className="pill-row">
            {assignments.map((assignment) => (
              <span
                className={isInactive(assignment.user_id) ? 'pill-warn' : undefined}
                key={assignment.id}
                title={isInactive(assignment.user_id) ? '비활성 계정이에요. 다른 담당자를 배정해 주세요.' : undefined}
              >
                {assignment.profiles?.name
                  ?? data.profiles.find((profile) => profile.id === assignment.user_id)?.name
                  ?? '알 수 없는 사용자'}
                {isInactive(assignment.user_id) ? ' · 비활성' : ''}
              </span>
            ))}
            {assignments.length === 0 && <span className="pill-warn">담당자 없음</span>}
          </div>
          {assignments.length === 0 && (
            <p className="product-unassigned-note">
              <strong>비고</strong>
              {product.unassigned_reason || '담당자가 없는 이유를 아직 적지 않았어요.'}
            </p>
          )}
          {!readOnly && onAssign && (
            <div className="master-card-actions">
              <button
                aria-label={`${product.name} ${assignments.length === 0 ? '담당자 배정' : '담당자 변경'}`}
                className={needsAssignee ? 'primary compact' : 'ghost compact'}
                onClick={() => onAssign(product.id)}
                type="button"
              >
                {assignments.length === 0 ? <UserPlus aria-hidden="true" size={15} /> : <UserRoundCog aria-hidden="true" size={15} />}
                {assignments.length === 0 ? '담당자 배정' : '담당자 변경'}
              </button>
            </div>
          )}
          {!readOnly && (
            <DeleteConfirmAction
              hideTrigger
              table="products"
              id={product.id}
              expectedUpdatedAt={product.updated_at}
              label="제품"
              itemName={product.name}
              warning={assignments.length > 0 ? masterDeleteWarnings.productWithAssignments(assignments.length) : masterDeleteWarnings.product}
              pendingDelete={pendingDelete}
              setPendingDelete={setPendingDelete}
              onConfirm={(input) => onDelete(product.id, input)}
            />
          )}
        </>
      )}
    </article>
  )
}
