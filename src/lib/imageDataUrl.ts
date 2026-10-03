/** Existing production CSP permits data: images, not blob: image URLs. */
export function imageDataUrl(image: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(new Error('메뉴 사진을 읽지 못했어요. 다시 시도해 주세요.'))
    reader.readAsDataURL(image)
  })
}
