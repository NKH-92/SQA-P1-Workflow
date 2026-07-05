import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src/data/p1DutyAllocation.ts'), 'utf8')
const match = src.match(/p1DutyAllocationRows = (\[[\s\S]*?\]) as const satisfies readonly P1DutyAllocationRow\[\]/)
if (!match) throw new Error('Could not parse p1DutyAllocationRows')

const rows = Function(`return ${match[1]}`)()
const profiles = {
  구하영: '83e892f2-61fc-481e-8fc6-2c20a6f71527',
  김지윤: '1f2b77db-3cfc-499d-8af4-ae34e8b58116',
  김초은: '28358260-51f0-481e-8637-4557ee727a6a',
  남광현: 'ae52b2ce-2f7a-4da6-8d25-de6a9852c524',
  편승훈: 'ba8af6cb-67c9-4189-ba7b-4ef7ce5353b4',
  이건우: '49f407f0-4773-4153-b354-18eedc6fc441',
  전예지: '2e5b5f01-5f60-4586-8944-3c0c54dae132',
  박지수: 'c00b2091-fc2e-4296-9df4-86d6e4dce8b7',
  정영주: '95ac598f-51cf-4cfc-8f5a-19ca60f4c11b',
  조소연: 'cb619618-5bf8-430e-9c7f-d4fb5cf13513',
}
const labelAssignees = new Set(['제품 담당자', '순차 배정'])

const esc = (value) => value.replace(/'/g, "''")
const majorCategories = []
for (const row of rows) {
  if (!majorCategories.includes(row.majorCategory)) majorCategories.push(row.majorCategory)
}

const outDir = join(root, 'scripts/.seed-batches')
mkdirSync(outDir, { recursive: true })

const majorValues = majorCategories
  .map((name, index) => `('${esc(name)}',${index + 1})`)
  .join(',\n  ')

const dutyValues = rows
  .map((row, index) => {
    const assigneeLabel = labelAssignees.has(row.assigneeName.trim()) ? `'${esc(row.assigneeName.trim())}'` : 'null'
    return `('${esc(row.majorCategory)}','${esc(row.dutyName)}',${index + 1},${assigneeLabel},'${esc(row.notes)}')`
  })
  .join(',\n  ')

const assignmentRows = rows
  .map((row, index) => {
    const name = row.assigneeName.trim()
    if (!name || labelAssignees.has(name)) return null
    const userId = profiles[name]
    if (!userId) throw new Error(`missing profile for ${name} / ${row.dutyName}`)
    return { sortOrder: index + 1, userId }
  })
  .filter(Boolean)

const assignmentValues = assignmentRows
  .map((row) => `(${row.sortOrder},'${row.userId}')`)
  .join(',\n  ')

const sql = `-- seed P1 duty allocation (${rows.length} duties)
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
console.log(`Generated ${majorCategories.length} major categories, ${rows.length} duties, ${assignmentRows.length} assignments`)
