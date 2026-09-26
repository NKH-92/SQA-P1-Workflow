import { useMemo } from 'react'
import {
  addProduct,
  assignProduct,
  deleteProduct,
  importProducts,
  saveProductAssignments,
  updateProduct,
} from '../../../data'
import type { AppData, Profile } from '../../../types'
import type { AppDataUpdater } from '../../../data/repositories/appDataUpdater'
import { createSequentialRepositoryContext } from '../../change-applications/sequentialContext'

export function useProductAdminController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  // 담당자 교체 뒤 같은 저장 안에서 미완료 업무를 넘기므로, 앞선 쓰기를 다음 쓰기가 보게 한다.
  const context = useMemo(() => createSequentialRepositoryContext(profile, data, setData), [data, profile, setData])
  return {
    importRows: (rows: Parameters<typeof importProducts>[1]) => importProducts(context, rows),
    add: (input: Parameters<typeof addProduct>[1]) => addProduct(context, input),
    assign: (input: Parameters<typeof assignProduct>[1]) => assignProduct(context, input),
    saveAssignments: (input: Parameters<typeof saveProductAssignments>[1]) => saveProductAssignments(context, input),
    update: (id: string, input: Parameters<typeof updateProduct>[2]) => updateProduct(context, id, input),
    remove: (id: string, input: Parameters<typeof deleteProduct>[2]) => deleteProduct(context, id, input),
  }
}
