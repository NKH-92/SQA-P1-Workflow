import type {
  AppData,
  ChangeActionItem,
  ChangeApplication,
  ProductChangeTask,
} from '../../types'

export type ProductChangeTaskContext = {
  task: ProductChangeTask
  actionItem: ChangeActionItem
  application: ChangeApplication
}

export function selectProductChangeTaskContexts(data: AppData): ProductChangeTaskContext[] {
  const actionItems = new Map(data.changeActionItems.map((item) => [item.id, item]))
  const applications = new Map(data.changeApplications.map((item) => [item.id, item]))
  return data.productChangeTasks.flatMap((task) => {
    const actionItem = actionItems.get(task.action_item_id)
    const application = actionItem ? applications.get(actionItem.change_application_id) : null
    return actionItem && application ? [{ task, actionItem, application }] : []
  })
}
