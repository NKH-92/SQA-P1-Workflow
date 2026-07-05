import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(join(root, 'src/data/p1ProductAllocation.ts'), 'utf8')
const match = src.match(/\[[\s\S]*?\] as const/)
if (!match) throw new Error('Could not parse p1ProductAllocationRows')

const rows = Function(`return ${match[0].replace(' as const', '')}`)()
const profiles = {
  구하영: '83e892f2-61fc-481e-8fc6-2c20a6f71527',
  김지윤: '1f2b77db-3cfc-499d-8af4-ae34e8b58116',
  김초은: '28358260-51f0-481e-8637-4557ee727a6a',
  편승훈: 'ba8af6cb-67c9-4189-ba7b-4ef7ce5353b4',
  이건우: '49f407f0-4773-4153-b354-18eedc6fc441',
  전예지: '2e5b5f01-5f60-4586-8944-3c0c54dae132',
}

const esc = (value) => value.replace(/'/g, "''")
const chunkSize = 55
const outDir = join(root, 'scripts/.seed-batches')
mkdirSync(outDir, { recursive: true })

writeFileSync(
  join(outDir, '00-clear.sql'),
  'DELETE FROM public.product_assignments;\nDELETE FROM public.products;\n',
)

for (let index = 0; index < rows.length; index += chunkSize) {
  const chunk = rows.slice(index, index + chunkSize)
  const values = chunk
    .map((row, offset) => {
      const sortOrder = index + offset + 1
      return `('${esc(row.productName)}','${esc(row.category)}','${esc(row.companyName)}',${sortOrder})`
    })
    .join(',\n  ')
  const sql = `INSERT INTO public.products (name, category, company_name, sort_order)\nVALUES\n  ${values};`
  writeFileSync(join(outDir, `product-${String(Math.floor(index / chunkSize) + 1).padStart(2, '0')}.sql`), sql)
}

const assignedRows = rows
  .filter((row) => row.assigneeName.trim())
  .map((row) => {
    const userId = profiles[row.assigneeName.trim()]
    if (!userId) throw new Error(`missing profile for ${row.assigneeName} / ${row.productName}`)
    return `('${esc(row.productName)}','${userId}')`
  })

for (let index = 0; index < assignedRows.length; index += chunkSize) {
  const chunk = assignedRows.slice(index, index + chunkSize)
  const values = chunk.join(',\n  ')
  const sql = `WITH seed(name, user_id) AS (\n  VALUES\n  ${values}\n)\nINSERT INTO public.product_assignments (product_id, user_id)\nSELECT p.id, s.user_id::uuid\nFROM seed s\nJOIN public.products p ON p.name = s.name;`
  writeFileSync(join(outDir, `assign-${String(Math.floor(index / chunkSize) + 1).padStart(2, '0')}.sql`), sql)
}

console.log(`Generated ${rows.length} products in ${Math.ceil(rows.length / chunkSize)} chunks`)
