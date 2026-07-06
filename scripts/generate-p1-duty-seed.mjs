import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { esc, parseArgs, readCsvRows, readProfileMap } from './seed-utils.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = parseArgs(process.argv.slice(2))

const inputPath = args.input ?? join(root, 'data/private/p1-duties.local.csv')
const profilesPath = args.profiles ?? join(root, 'data/private/profile-map.local.json')

const LABEL_ASSIGNEES = new Set(['제품 담당자', '순차 배정'])

let rows
let profiles
try {
  ;({ rows } = readCsvRows(inputPath))
  profiles = readProfileMap(profilesPath)
} catch (error) {
  console.error(`Failed to read seed inputs.\n  duties: ${inputPath}\n  profiles: ${profilesPath}`)
  throw error
}

if (rows.length === 0) {
  throw new Error(`No duty rows found in ${inputPath}`)
}

const normalized = rows.map((row) => ({
  majorCategory: row['대분류'] ?? row.majorCategory ?? '',
  dutyName: row['업무명'] ?? row.dutyName ?? '',
  assigneeName: row['담당자명'] ?? row.assigneeName ?? '',
  notes: row['비고'] ?? row.notes ?? '',
}))

const outDir = join(root, 'scripts/.seed-batches')
mkdirSync(outDir, { recursive: true })

const majorCategories = []
for (const row of normalized) {
  if (!majorCategories.includes(row.majorCategory)) majorCategories.push(row.majorCategory)
}

const majorValues = majorCategories
  .map((name, index) => `('${esc(name)}',${index + 1})`)
  .join(',\n ')

const dutyValues = normalized
  .map((row, index) => {
    const assigneeLabel = LABEL_ASSIGNEES.has(row.assigneeName.trim()) ? `'${esc(row.assigneeName.trim())}'` : 'null'
    return `('${esc(row.majorCategory)}','${esc(row.dutyName)}',${index + 1},${assigneeLabel},'${esc(row.notes)}')`
  })
  .join(',\n ')

const assignmentRows = normalized
  .map((row, index) => {
    const name = row.assigneeName.trim()
    if (!name || LABEL_ASSIGNEES.has(name)) return null
    const userId = profiles[name]
    if (!userId) throw new Error(`missing profile for ${name} / ${row.dutyName}`)
    return { sortOrder: index + 1, userId }
  })
  .filter(Boolean)

const assignmentValues = assignmentRows
  .map((row) => `(${row.sortOrder},'${row.userId}')`)
  .join(',\n ')

const sql = `-- seed duty allocation (${normalized.length} duties)
DELETE FROM public.duty_assignments;
DELETE FROM public.duties;
DELETE FROM public.duty_major_categories;

WITH major_seed(name, sort_order) AS (
 VALUES
 ${majorValues}
), major_ins AS (
 INSERT INTO public.duty_major_categories (name, sort_order)
 SELECT name, sort_order FROM major_seed
 RETURNING id, name
), duty_seed(major_name, duty_name, sort_order, assignee_label, notes) AS (
 VALUES
 ${dutyValues}
)
INSERT INTO public.duties (major_category_id, name, sort_order, assignee_label, notes)
SELECT m.id, d.duty_name, d.sort_order, d.assignee_label, d.notes
FROM duty_seed d
JOIN major_ins m ON m.name = d.major_name;

WITH duty_seed(sort_order, user_id) AS (
 VALUES
 ${assignmentValues}
)
INSERT INTO public.duty_assignments (duty_id, user_id)
SELECT d.id, s.user_id::uuid
FROM duty_seed s
JOIN public.duties d ON d.sort_order = s.sort_order;
`

writeFileSync(join(outDir, 'duty-seed.sql'), sql)
console.log(`Generated ${majorCategories.length} major categories, ${normalized.length} duties, ${assignmentRows.length} assignments`)
