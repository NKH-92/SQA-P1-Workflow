import { isPreviewMode, supabase } from '../../lib/supabase'
import { menuWeek, validateMenuFile } from '../validation/weeklyMenu'

const BUCKET = 'weekly-menus'
const CURRENT_MENU = 'current-menu'
export type WeeklyMenu = { image: Blob; uploadedAt: string }

/** 프리뷰에서도 큰 캡처를 localStorage 용량 제한 없이 보관한다. */
async function previewStore(week: string, value?: WeeklyMenu): Promise<WeeklyMenu | null> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('sqa-weekly-menus', 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains('menus')) request.result.createObjectStore('menus')
      else request.transaction!.objectStore('menus').clear()
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(new Error('이 브라우저에서 사진 저장소를 열 수 없어요.'))
  })
  try {
    return await new Promise<WeeklyMenu | null>((resolve, reject) => {
      const tx = db.transaction('menus', value ? 'readwrite' : 'readonly')
      const store = tx.objectStore('menus')
      // clear + put share one transaction: a failed write preserves the old image.
      if (value) store.clear()
      const request = value ? store.put({ ...value, week }, CURRENT_MENU) : store.get(CURRENT_MENU)
      tx.oncomplete = () => {
        if (value) { resolve(value); return }
        const saved = request.result as (WeeklyMenu & { week: string }) | undefined
        resolve(saved?.week === week ? saved : null)
      }
      tx.onerror = tx.onabort = () => reject(new Error('사진을 저장하거나 읽지 못했어요. 브라우저 저장 공간을 확인해 주세요.'))
    })
  } finally {
    db.close()
  }
}

export async function loadWeeklyMenu(week: string): Promise<WeeklyMenu | null> {
  if (isPreviewMode) return previewStore(week)
  if (!supabase) throw new Error('메뉴판 저장소에 연결할 수 없어요.')
  const bucket = supabase.storage.from(BUCKET)
  const { data, error } = await bucket.list('', { limit: 1, search: CURRENT_MENU })
  if (error) throw new Error('이번 주 메뉴를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.')
  const latest = data?.find((item) => item.name === CURRENT_MENU)
  if (!latest) return null
  const updatedAt = latest.updated_at ?? latest.created_at
  if (!updatedAt || menuWeek(new Date(updatedAt)) !== week) return null
  // Fixed path replacement: bypass browser/CDN caches for each object revision.
  const result = await bucket.download(CURRENT_MENU, { cacheNonce: updatedAt }, { cache: 'no-store' })
  if (result.error) throw new Error('메뉴 사진을 불러오지 못했어요. 다시 시도해 주세요.')
  return { image: result.data, uploadedAt: updatedAt }
}

export async function publishWeeklyMenu(week: string, file: File): Promise<WeeklyMenu> {
  validateMenuFile(file)
  if (week !== menuWeek()) throw new Error('새로운 주가 시작됐어요. 메뉴판을 다시 열고 올려 주세요.')
  const menu = { image: file as Blob, uploadedAt: new Date().toISOString() }
  if (isPreviewMode) {
    await previewStore(week, menu)
    return menu
  }
  if (!supabase) throw new Error('메뉴판 저장소에 연결할 수 없어요.')
  // Storage replaces the object and disposes of its previous version server-side.
  // Do not delete first: failed uploads must leave the published menu intact.
  const { error } = await supabase.storage.from(BUCKET).upload(CURRENT_MENU, file, {
    contentType: file.type, cacheControl: '0', upsert: true,
  })
  if (error) throw new Error('메뉴를 올리지 못했어요. 연결 상태와 계정 권한을 확인하고 다시 시도해 주세요.')
  return menu
}
