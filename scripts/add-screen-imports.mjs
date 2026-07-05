import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const screensDir = path.join(root, 'src/screens')

const baseImports = `import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Dispatch, SetStateAction } from 'react'
`

const uiImport = `import { Badge, FormGrid, IconAction, Kpi, Rows, Section } from '../components/ui'
`

const files = fs.readdirSync(screensDir).filter((name) => name.endsWith('.tsx'))

for (const file of files) {
  const fullPath = path.join(screensDir, file)
  let body = fs.readFileSync(fullPath, 'utf8')
  if (body.includes("from 'react'")) continue

  const name = file.replace('.tsx', '')
  let header = baseImports

  if (name !== 'LoadingScreen') header += uiImport

  if (['LeaderDashboard', 'Dashboard', 'TeamPanel', 'ReviewsPanel', 'ReviewRequestItem', 'ProjectsPanel', 'ActivityPanel', 'MasterPanel', 'Shell'].includes(name)) {
    header += `import type { AppData, Profile, ReviewFeedback, ReviewRequest, ReviewStatus, Role, ProjectStatus } from '../types'
import type { AdminDeleteTable, DeadlineMode, MasterTabId, ReviewStatusFilter, TabId } from '../app/types'
`
  }

  if (name === 'AuthPanel' || name === 'PasswordChangePanel' || name === 'BlockedProfile') {
    header += `import type { Profile } from '../types'
`
  }

  if (name === 'Shell') {
    header += `import type { AppData, Role } from '../types'
import type { TabId, ToastMessage } from '../app/types'
`
  }

  if (['LeaderDashboard', 'Dashboard', 'TeamPanel', 'ReviewsPanel', 'ProjectsPanel', 'MasterPanel'].includes(name)) {
    header += `import { recordActivityLog } from '../lib/activityLog'
import { downloadCsv } from '../lib/csv'
import { normalizeHttpUrl } from '../lib/urls'
import { supabase, hasSupabaseConfig } from '../lib/supabase'
import { formatDate, makeId, projectStatusLabels, reviewStatusLabels, roleLabels } from '../lib/format'
`
  }

  if (name === 'ReviewsPanel' || name === 'ReviewRequestItem') {
    header += `import { resolveAttachmentHref, uploadReviewAttachment } from '../lib/attachments'
import { compareReviewRequests } from '../lib/priority'
import { dueDateLabel, dueDateStatus, daysUntil } from '../lib/dates'
import { toUserMessage } from '../lib/errors'
`
  }

  if (name === 'LeaderDashboard') {
    header += `import { buildReviewMonthlyStats } from '../lib/stats'
import { ageInDays, dueDateLabel, daysUntil } from '../lib/dates'
import { reviewPriorityScore } from '../lib/priority'
import { useTeamSummaries } from '../hooks/useTeamSummaries'
`
  }

  if (name === 'TeamPanel') {
    header += `import { useTeamSummaries } from '../hooks/useTeamSummaries'
`
  }

  if (name === 'MasterPanel') {
    header += `import { deleteWarnings } from '../app/constants'
import { parseCsvRows, parseInviteImportRows, parseProductImportRows } from '../lib/csvImport'
`
  }

  if (name === 'ProjectsPanel') {
    header += `import { canAssignProjectTo } from '../domain/permissions'
import { ageInDays, dueDateLabel, dueDateStatus, daysUntil } from '../lib/dates'
`
  }

  if (name === 'ReviewsPanel') {
    header += `import { ReviewRequestItem } from './ReviewRequestItem'
`
  }

  if (name === 'AuthPanel') {
    header += `import { PASSWORD_MIN_LENGTH, TEMP_PASSWORD_MIN_LENGTH } from '../app/constants'
import { toUserMessage } from '../lib/errors'
import { hasSupabaseConfig, supabase } from '../lib/supabase'
`
  }

  if (name === 'PasswordChangePanel') {
    header += `import { PASSWORD_MIN_LENGTH } from '../app/constants'
import { toUserMessage } from '../lib/errors'
import { supabase } from '../lib/supabase'
`
  }

  if (name === 'LoadingScreen') {
    header = `import { RefreshCw } from 'lucide-react'
`
  }

  if (name === 'ActivityPanel') {
    header += `import type { AppData } from '../types'
import { formatDate } from '../lib/format'
`
  }

  if (name !== 'LoadingScreen' && name !== 'BlockedProfile') {
    header += `import {
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  ClipboardList,
  Download,
  FolderKanban,
  ListFilter,
  LogOut,
  Menu,
  MessageSquare,
  Package,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  StickyNote,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react'
`
  }

  body = body.replace(/React\.Dispatch<React\.SetStateAction<AppData>>/g, 'Dispatch<SetStateAction<AppData>>')

  fs.writeFileSync(fullPath, `${header}\n${body}`)
  console.log(`Updated imports: ${file}`)
}
