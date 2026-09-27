import { describe, expect, it } from 'vitest'
import type { Profile } from '../../types'
import { HOTSPOT_TABS, hotspotsForViewer, personDestination } from './officeNavigation'
import { SCENE_HOTSPOTS } from './officeScene'

const leader: Profile = { id: 'leader', email: '', name: '파트장', role: 'leader' }
const teamLeader: Profile = { id: 'team-leader', email: '', name: '팀장', role: 'team_leader' }
const member: Profile = { id: 'member', email: '', name: '파트원', role: 'member' }
const colleague: Profile = { id: 'colleague', email: '', name: '동료', role: 'member' }
const profiles = [leader, teamLeader, member, colleague]

describe('office navigation', () => {
  it('sends each object to its screen', () => {
    expect(HOTSPOT_TABS).toEqual({
      projects: 'projects',
      cabinet: 'change-applications',
      kanban: 'reviews',
      notice: 'announcements',
      nameplates: 'team',
      stats: 'review-stats',
      gate: 'invites',
      logbook: 'activity',
      samples: 'products',
      duties: 'duties',
    })
  })

  it('shows members only the objects for screens in their menu, and the meeting room to everyone', () => {
    const ids = SCENE_HOTSPOTS.map((hotspot) => hotspot.id)
    expect(hotspotsForViewer(ids, member).sort()).toEqual(['cabinet', 'kanban', 'meeting', 'notice', 'projects'])
    expect(hotspotsForViewer(ids, leader)).toEqual(ids)
    expect(hotspotsForViewer(ids, teamLeader)).toEqual(ids)
  })

  it('opens a member’s own work but not colleagues’ work for members', () => {
    expect(personDestination(member, { profileId: member.id, name: member.name }, [member])).toEqual({ tab: 'work' })
    expect(personDestination(member, { profileId: colleague.id, name: colleague.name }, [member])).toBeNull()
    expect(personDestination(member, { profileId: leader.id, name: leader.name }, [member, leader])).toBeNull()
  })

  it('opens the team detail for members and the person view of projects for leaders', () => {
    for (const viewer of [leader, teamLeader]) {
      expect(personDestination(viewer, { profileId: colleague.id, name: colleague.name }, profiles)).toEqual({
        tab: 'team',
        entityId: colleague.id,
      })
      expect(personDestination(viewer, { profileId: leader.id, name: leader.name }, profiles)).toEqual({
        tab: 'projects',
        personName: leader.name,
      })
    }
    expect(personDestination(leader, { profileId: 'unknown', name: '?' }, profiles)).toBeNull()
  })

  it('treats an inactive leader like a member viewer', () => {
    const inactive = { ...leader, is_active: false }
    expect(personDestination(inactive, { profileId: colleague.id, name: colleague.name }, profiles)).toBeNull()
  })
})
