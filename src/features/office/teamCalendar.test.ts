import { describe, expect, it } from 'vitest'
import { leavesByDay, monthDays, moveMonth } from './teamCalendar'
import type { MemberLeave } from '../../types'

describe('team calendar date-only model', () => {
  it('builds complete weeks including leap day and crosses year boundaries', () => {
    const february = monthDays('2028-02')
    expect(february).toHaveLength(35)
    expect(february.filter(Boolean)).toHaveLength(29)
    expect(february).toContain('2028-02-29')
    expect(moveMonth('2027-12', 1)).toBe('2028-01')
    expect(moveMonth('2028-01', -1)).toBe('2027-12')
  })

  it('clips cross-month leaves to the displayed dates and keeps overlapping people', () => {
    const leaves: MemberLeave[] = [
      { id: 'leave', profile_id: 'b', name: '나', kind: 'vacation', starts_on: '2028-03-02', ends_on: '2028-03-02', note: '' },
      { id: 'trip', profile_id: 'a', name: '가', kind: 'trip', starts_on: '2028-02-28', ends_on: '2028-03-02', note: '' },
    ]
    const february = leavesByDay(leaves, ['2028-02-28', '2028-02-29'])
    expect(february.get('2028-02-28')?.map(item => item.id)).toEqual(['trip'])
    expect(february.get('2028-02-29')?.map(item => item.id)).toEqual(['trip'])
    const march = leavesByDay(leaves, ['2028-03-01', '2028-03-02', '2028-03-03'])
    expect(march.get('2028-03-01')?.map(item => item.id)).toEqual(['trip'])
    expect(march.get('2028-03-02')?.map(item => item.id)).toEqual(['trip', 'leave'])
    expect(march.get('2028-03-03')).toEqual([])
  })
})
