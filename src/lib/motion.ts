/** ‘동작 줄이기’ 설정을 존중하는 스크롤 방식. 자바스크립트 스크롤도 CSS와 같은 기준을 따른다. */
export function preferredScrollBehavior(): ScrollBehavior {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'auto'
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
}
