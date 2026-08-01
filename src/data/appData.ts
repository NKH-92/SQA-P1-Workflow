import type { AppData } from '../types'

export function createEmptyAppData(): AppData {
  return {
    announcements: [],
    changeApplications: [],
    changeApplicationSummaries: [],
    changeActionItems: [],
    productChangeTasks: [],
    changeProductScope: [],
    changeAssigneeOptions: [],
    profiles: [],
    allowedUsers: [],
    products: [],
    dutyMajorCategories: [],
    duties: [],
    productAssignments: [],
    dutyAssignments: [],
    reviewRequests: [],
    reviewEvents: [],
    reviewReadReceipts: [],
    auditEvents: [],
    projects: [],
    projectAssignments: [],
    profileNotes: [],
    activityLogs: [],
  }
}
