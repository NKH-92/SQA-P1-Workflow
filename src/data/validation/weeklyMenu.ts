import { businessDateKey } from '../../lib/businessTime'
import { imageDataUrl } from '../../lib/imageDataUrl'

export const MENU_MAX_BYTES = 10 * 1024 * 1024
export const MENU_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const

/** 한국 시간의 월요일. 기기 시간대와 관계없이 서버의 주 구분과 일치한다. */
export function menuWeek(now = new Date()) {
  const day = new Date(`${businessDateKey(now)}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7)
  return day.toISOString().slice(0, 10)
}

export function menuWeekLabel(week: string) {
  const end = new Date(`${week}T00:00:00Z`)
  end.setUTCDate(end.getUTCDate() + 6)
  return `${week.replace(/-/g, '.')} ~ ${end.toISOString().slice(5, 10).replace('-', '.')}`
}

export function validateMenuFile(file: File) {
  if (!(MENU_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new Error('PNG, JPG, WebP 사진 파일을 선택해 주세요.')
  }
  if (!file.size || file.size > MENU_MAX_BYTES) throw new Error('0바이트가 아닌 10MB 이하 사진을 선택해 주세요.')
}

/** 확장자가 아니라 실제로 브라우저에서 읽을 수 있는 사진인지 확인한다. */
export async function inspectMenuImage(file: File) {
  validateMenuFile(file)
  try {
    const image = new Image()
    image.src = await imageDataUrl(file)
    await image.decode()
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 80_000_000) {
      throw new Error('사진 크기가 너무 커요. 8천만 화소 이하로 캡처해 주세요.')
    }
    return { width: image.naturalWidth, height: image.naturalHeight }
  } catch (error) {
    if (error instanceof Error && error.message.includes('화소')) throw error
    throw Object.assign(new Error('사진을 읽을 수 없어요. 다른 캡처 파일을 선택해 주세요.'), { cause: error })
  }
}
