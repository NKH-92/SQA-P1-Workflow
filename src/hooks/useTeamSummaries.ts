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

  return { teamMembers, teamSummaries }
}
