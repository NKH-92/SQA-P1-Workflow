const preferences = new Map<string, boolean>()
const shown = new Set<string>()
export function morningBriefEnabled(id: string): boolean {
  if (preferences.has(id)) return preferences.get(id)!
  try { return localStorage.getItem(`sqa.morning-brief-off.${id}`) !== '1' } catch { return true }
}
export function setMorningBriefEnabled(id: string, enabled: boolean) {
  preferences.set(id, enabled)
  try { localStorage.setItem(`sqa.morning-brief-off.${id}`, enabled ? '0' : '1') } catch { /* 세션 UI는 선택 유지 */ }
}
export function hasSeenMorningBrief(id: string, date: string): boolean {
  if (shown.has(`${id}:${date}`)) return true
  try { return localStorage.getItem(`sqa.morning-brief.${id}`) === date } catch { return false }
}
export function markMorningBriefSeen(id: string, date: string) {
  shown.add(`${id}:${date}`)
  try { localStorage.setItem(`sqa.morning-brief.${id}`, date) } catch { /* 같은 세션에서는 재표시하지 않는다. */ }
}
