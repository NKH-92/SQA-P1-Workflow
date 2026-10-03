import { Modal } from '../components/ui'
import { QuestContent, type QuestProps } from './QuestContent'

export function QuestDrawer({ onClose, ...props }: QuestProps & { onClose(): void }) {
  return <Modal open onClose={onClose} title="오늘 할 일" className="quest-drawer">
    <QuestContent {...props} setQuestCollapsed={onClose} setActiveTab={(tab, id) => { onClose(); props.setActiveTab(tab, id) }} />
  </Modal>
}
