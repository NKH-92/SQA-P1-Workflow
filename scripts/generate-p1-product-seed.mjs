import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { esc, parseArgs, readCsvRows, readProfileMap } from './seed-utils.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const args = parseArgs(process.argv.slice(2))

const inputPath = args.input ?? join(root, 'data/private/p1-products.local.csv')
const profilesPath = args.profiles ?? join(root, 'data/private/profile-map.local.json')

let rows
let profiles
try {
  ;({ rows } = readCsvRows(inputPath))
  profiles = readProfileMap(profilesPath)
} catch (error) {
  console.error(`Failed to read seed inputs.\n  products: ${inputPath}\n  profiles: ${profilesPath}`)
  throw error
}

if (rows.length === 0) {
  throw new Error(`No product rows found in ${inputPath}`)
}

const normalized = rows.map((row) => ({
  category: row['구분'] ?? row.category ?? '자사',
  productName: row['제품명'] ?? row.productName ?? '',
  assigneeName: row['담당자명'] ?? row.assigneeName ?? '',
  companyName: row['위탁사명'] ?? row.companyName ?? (row['구분'] === '위탁' ? '' : '자사'),
}))

const chunkSize = 55
const outDir = join(root, 'scripts/.seed-batches')
mkdirSync(outDir, { recursive: true })

writeFileSync(
  join(outDir, '00-clear.sql'),
  'DELETE FROM public.product_assignments;\nDELETE FROM public.products;\n',
)

for (let index = 0; index < normalized.length; index += chunkSize) {
  const chunk = normalized.slice(index, index + chunkSize)
  const values = chunk
    .map((row, offset) => {
      const sortOrder = index + offset + 1
      return `('${esc(row.productName)}','${esc(row.category)}','${esc(row.companyName)}',${sortOrder})`
    })
    .join(',\n  ')
  const sql = `INSERT INTO public.products (name, category, company_name, sort_order)\nVALUES\n  ${values};`
  writeFileSync(join(outDir, `product-${String(Math.floor(index / chunkSize) + 1).padStart(2, '0')}.sql`), sql)
}

const assignedRows = normalized
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

console.log(`Generated ${normalized.length} products in ${Math.ceil(normalized.length / chunkSize)} chunks`)
