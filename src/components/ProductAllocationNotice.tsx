import { productAllocationIsProvisional } from '../lib/productAllocationStatus'
import './ProductAllocationNotice.css'

export function ProductAllocationNotice({ compact = false }: { compact?: boolean }) {
  if (!productAllocationIsProvisional) return null
  return compact
    ? <span className="product-allocation-notice"><span aria-hidden="true">VOID</span><span className="sr-only">담당제품 임시 배정</span></span>
    : <span className="product-allocation-notice">담당제품 임시 배정</span>
}
