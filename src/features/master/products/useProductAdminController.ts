import { useMemo } from 'react'
import {
  addProduct,
  assignProduct,
  createRepositoryContext,
  deleteProduct,
  importProducts,
  saveProductAssignments,
  updateProduct,
} from '../../../data'
import type { AppData, Profile } from '../../../types'
import type { AppDataUpdater } from '../../../data/repositories/appDataUpdater'

export function useProductAdminController(profile: Profile, data: AppData, setData: AppDataUpdater) {
  const context = useMemo(() => createRepositoryContext(profile, data, setData), [data, profile, setData])
  return {
    importRows: (rows: Parameters<typeof importProducts>[1]) => importProducts(context, rows),
    add: (input: Parameters<typeof addProduct>[1]) => addProduct(context, input),
    assign: (input: Parameters<typeof assignProduct>[1]) => assignProduct(context, input),
    saveAssignments: (input: Parameters<typeof saveProductAssignments>[1]) => saveProductAssignments(context, input),
    update: (id: string, input: Parameters<typeof updateProduct>[2]) => updateProduct(context, id, input),
    remove: (id: string) => deleteProduct(context, id),
  }
}
