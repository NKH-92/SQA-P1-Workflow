import type { TabId } from '../lib/navigation'
import { prefersReducedMotion } from '../lib/motion'
const loaded = new Set<TabId>()
const listeners = new Set<() => void>()
const loaders = new Map<TabId, () => Promise<unknown>>()
export function trackRouteLoad<T>(tabs: TabId[], load: () => Promise<T>): () => Promise<T> {
  const run = async () => {
    const module = await load()
    let changed = false
    for (const tab of tabs) { if (!loaded.has(tab)) changed = true; loaded.add(tab) }
    if (changed) listeners.forEach(listener => listener())
    return module
  }
  tabs.forEach(tab => loaders.set(tab, run))
  return run
}
export const officeCodeLoaded = () => loaded.has('dashboard')
export const subscribeRouteLoads = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
export function prefetchRoute(tab: TabId) { return loaders.get(tab)?.() ?? Promise.resolve() }
/** navigation keeps ownership of heading focus; decoration never delays it. */
export function fromOffice(tab: TabId, navigate: () => void) {
  const animate = loaded.has(tab) && !prefersReducedMotion() && document.documentElement.dataset.ui === 'pixel'
  navigate()
  if (!animate) return
  requestAnimationFrame(() => {
    const content = document.querySelector<HTMLElement>('.content')
    if (!content || content.querySelector('.route-loading')) return
    content.dataset.transition = 'iris'
    const animation = content.animate?.([{ clipPath: 'circle(30% at 50% 40%)', opacity: .6 }, { clipPath: 'circle(150% at 50% 40%)', opacity: 1 }], { duration: 250, easing: 'ease-out' })
    const clear = () => { delete content.dataset.transition }
    if (animation) animation.finished.then(clear, clear)
    else clear()
  })
}
