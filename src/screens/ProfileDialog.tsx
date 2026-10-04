import type { ReactNode } from 'react'
import { Modal } from '../components/ui'

export function ProfileDialog({ children, onClose }: { children: ReactNode; onClose(): void }) {
  return <Modal open title="내 프로필" onClose={onClose} className="profile-dialog">{children}</Modal>
}
