import type { AppData, Profile } from '../../types'

export type ReviewResolutionSummary = {
  submitted: number
  approved: number
  rejected: number
  resolved: number
  remaining: number
  percent: number | null
}

export function buildReviewResolutionSummary({
  submitted,
  approved,
  rejected,
}: {
  submitted: number
  approved: number
  rejected: number
}): ReviewResolutionSummary {
  const safeSubmitted = Math.max(0, submitted)
  const safeApproved = Math.max(0, approved)
  const safeRejected = Math.max(0, rejected)
  const resolved = safeApproved + safeRejected
  const remaining = Math.max(safeSubmitted - resolved, 0)
  const percent = safeSubmitted === 0
    ? null
    : Math.min(100, Math.max(0, Math.round((resolved / safeSubmitted) * 100)))

  return {
    submitted: safeSubmitted,
    approved: safeApproved,
    rejected: safeRejected,
    resolved,
    remaining,
    percent,
  }
}

export function selectActiveProjects(data: Pick<AppData, 'projects'>) {
  return data.projects
    .filter((project) => project.status !== 'done')
    .sort((left, right) => {
      const leftDeadline = left.deadline ?? '9999-12-31'
      const rightDeadline = right.deadline ?? '9999-12-31'
      return leftDeadline.localeCompare(rightDeadline) || left.name.localeCompare(right.name, 'ko-KR')
    })
}

export type TeamAllocation = {
  member: Profile
  productCount: number
  dutyCount: number
  activeProjectCount: number
  totalCount: number
  relativePercent: number
}

export function buildTeamAllocations(
  data: Pick<AppData, 'products' | 'projects' | 'productAssignments' | 'dutyAssignments' | 'projectAssignments'>,
  members: readonly Profile[],
): TeamAllocation[] {
  const projectById = new Map(data.projects.map((project) => [project.id, project]))
  const rows = members
    .filter((member) => member.is_active !== false)
    .map((member) => {
      const productCount = data.productAssignments.filter((assignment) => assignment.user_id === member.id).length
      const dutyCount = data.dutyAssignments.filter((assignment) => assignment.user_id === member.id).length
      const activeProjectCount = data.projectAssignments.filter((assignment) => {
        if (assignment.user_id !== member.id) return false
        const project = assignment.projects ?? projectById.get(assignment.project_id)
        return project != null && project.status !== 'done'
      }).length
      return {
        member,
        productCount,
        dutyCount,
        activeProjectCount,
        totalCount: productCount + dutyCount + activeProjectCount,
        relativePercent: 0,
      }
    })
    .sort((left, right) => right.totalCount - left.totalCount || left.member.name.localeCompare(right.member.name, 'ko-KR'))

  const maxCount = rows.reduce((maximum, row) => Math.max(maximum, row.totalCount), 0)
  return rows.map((row) => ({
    ...row,
    relativePercent: maxCount === 0 ? 0 : Math.round((row.totalCount / maxCount) * 100),
  }))
}

export function leaderReviewRange(dateKey: string, monthCount = 6) {
  const [year, month] = dateKey.split('-').map(Number)
  const totalMonth = year * 12 + (month - 1) - Math.max(0, monthCount - 1)
  const fromYear = Math.floor(totalMonth / 12)
  const fromMonth = (totalMonth % 12) + 1
  return {
    from: `${fromYear}-${String(fromMonth).padStart(2, '0')}-01`,
    to: dateKey,
  }
}
