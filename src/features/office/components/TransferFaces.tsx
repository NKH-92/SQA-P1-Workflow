import { ArrowRight } from 'lucide-react'
import type { Profile } from '../../../types'
import { PersonFace } from './PersonFace'
import { usePixelUi } from '../pixelUiContext'
/** 기존 활동 기록에 두 식별자가 모두 있는 경우에만 이관을 장식한다. */
export function TransferFaces({ metadata, people }: { metadata?: Record<string, unknown>; people: readonly Profile[] }) {
  const pixel = usePixelUi()
  if (!pixel.enabled || typeof metadata?.from_assignee_id !== 'string' || typeof metadata?.to_assignee_id !== 'string') return null
  const from = people.find(p => p.id === metadata.from_assignee_id)
  const to = people.find(p => p.id === metadata.to_assignee_id)
  if (!from || !to) return null
  return <span className="person-inline" aria-hidden="true"><PersonFace profileId={from.id} name={from.name} size="xs" /><ArrowRight size={12} /><PersonFace profileId={to.id} name={to.name} size="xs" /></span>
}
