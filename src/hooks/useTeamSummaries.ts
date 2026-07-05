import type { AppData, Profile } from '../types'
import { useMemo } from 'react'

export type TeamSummary = {
  member: Profile
  products: AppData['productAssignments']
  duties: AppData['dutyAssignments']
  projects: AppData['projectAssignments']
  reviews: AppData['reviewRequests']
  notes: AppData['profileNotes']
}

export type WorkloadSummary = TeamSummary & {
  load: number
  tone: 'overdue' | 'due_soon' | 'scheduled'
  label: string
}

export function useTeamSummaries(data: AppData) {
  const teamMembers = useMemo(() => data.profiles.filter((item) => item.role === 'member'), [data.profiles])

  const teamSummaries = useMemo<TeamSummary[]>(
    () =>
      teamMembers.map((member) => ({
        member,
        products: data.productAssignments.filter((assignment) => assignment.user_id === member.id),
        duties: data.dutyAssignments.filter((assignment) => assignment.user_id === member.id),
        projects: data.projectAssignments.filter((assignment) => assignment.user_id === member.id),
        reviews: data.reviewRequests.filter((request) => request.requester_id === member.id),
        notes: data.profileNotes.filter((note) => note.profile_id === member.id),
      })),
    [data.dutyAssignments, data.productAssignments, data.profileNotes, data.projectAssignments, data.reviewRequests, teamMembers],
  )

  const workloadSummaries = useMemo<WorkloadSummary[]>(
    () =>
      teamSummaries.map((summary) => {
        const load =
          summary.products.length +
          summary.duties.length +
          summary.projects.length +
          summary.reviews.filter((request) => request.status !== 'approved').length
        return {
          ...summary,
          load,
          tone: load >= 8 ? 'overdue' : load >= 5 ? 'due_soon' : 'scheduled',
          label: load >= 8 ? '부하 높음' : load >= 5 ? '주의' : '안정',
        }
      }),
    [teamSummaries],
  )

  return { teamMembers, teamSummaries, workloadSummaries }
}
