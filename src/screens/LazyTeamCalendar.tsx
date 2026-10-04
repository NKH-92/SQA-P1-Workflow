import { lazy } from 'react'
export const LazyTeamCalendar = lazy(() => import('./TeamCalendarDialog').then(m => ({ default: m.TeamCalendarDialog })))
