import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const assetsDir = path.resolve('dist/assets')
const manifestPath = path.resolve('dist/.vite/manifest.json')
const MAX_CHUNK_BYTES = 560 * 1024
// Route-level lazy loading reduced the measured initial JS from ~185.3 KiB to
// ~140.3 KiB. Splitting gzip dictionaries raises the all-routes sum, so enforce
// both dimensions: initial navigation and the total code surface.
const MAX_INITIAL_GZIP_BYTES = 142 * 1024
// Persistent import diagnostics and explicit accessibility state add a small,
// intentional all-routes cost without changing the initial navigation budget.
const MAX_TOTAL_GZIP_BYTES = 213 * 1024
const EXPECTED_ROUTE_DYNAMIC_IMPORTS = new Set([
  'src/screens/AnnouncementsPanel.tsx',
  'src/screens/ChangeApplicationsPanel.tsx',
  'src/screens/DashboardPanels.ts',
  'src/screens/MyWorkPanel.tsx',
  'src/screens/ProjectsPanel.tsx',
  'src/screens/LeaderAdminPanels.ts',
  'src/screens/ReviewPanels.ts',
])

const names = (await readdir(assetsDir)).filter((name) => name.endsWith('.js'))
if (names.length === 0) throw new Error('Bundle budget check found no JavaScript assets')

let totalGzipBytes = 0
const oversized = []
const gzipBytesByFile = new Map()
for (const name of names) {
  const content = await readFile(path.join(assetsDir, name))
  const gzipBytes = gzipSync(content).byteLength
  gzipBytesByFile.set(`assets/${name}`, gzipBytes)
  totalGzipBytes += gzipBytes
  if (content.byteLength > MAX_CHUNK_BYTES) oversized.push(`${name}: ${content.byteLength} bytes`)
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const entryModules = Object.values(manifest).filter((entry) => entry.isEntry)
if (entryModules.length !== 1) {
  throw new Error(`Bundle manifest must contain exactly one entry module, found ${entryModules.length}`)
}
const routeDynamicImports = new Set(entryModules[0].dynamicImports ?? [])
const missingRouteImports = [...EXPECTED_ROUTE_DYNAMIC_IMPORTS].filter((key) => !routeDynamicImports.has(key))
const unexpectedRouteImports = [...routeDynamicImports].filter((key) => !EXPECTED_ROUTE_DYNAMIC_IMPORTS.has(key))
if (missingRouteImports.length > 0 || unexpectedRouteImports.length > 0) {
  throw new Error(
    `Route code-splitting contract failed:\nmissing: ${missingRouteImports.join(', ') || 'none'}\n`
      + `unexpected: ${unexpectedRouteImports.join(', ') || 'none'}`,
  )
}
const initialKeys = new Set()
const visitInitialImport = (key) => {
  if (initialKeys.has(key)) return
  const entry = manifest[key]
  if (!entry) throw new Error(`Bundle manifest references unknown import: ${key}`)
  initialKeys.add(key)
  for (const importedKey of entry.imports ?? []) visitInitialImport(importedKey)
}
for (const [key, entry] of Object.entries(manifest)) {
  if (entry.isEntry) visitInitialImport(key)
}
const initialGzipBytes = [...initialKeys].reduce((total, key) => {
  const file = manifest[key].file
  const bytes = gzipBytesByFile.get(file)
  if (bytes == null) throw new Error(`Bundle manifest entry is not a JavaScript asset: ${file}`)
  return total + bytes
}, 0)

if (oversized.length > 0) {
  throw new Error(`JavaScript chunk budget exceeded (${MAX_CHUNK_BYTES} bytes):\n${oversized.join('\n')}`)
}
if (initialGzipBytes > MAX_INITIAL_GZIP_BYTES) {
  throw new Error(
    `Initial JavaScript gzip budget exceeded: ${initialGzipBytes} > ${MAX_INITIAL_GZIP_BYTES} bytes`,
  )
}
if (totalGzipBytes > MAX_TOTAL_GZIP_BYTES) {
  throw new Error(`Total JavaScript gzip budget exceeded: ${totalGzipBytes} > ${MAX_TOTAL_GZIP_BYTES} bytes`)
}

console.log(
  `Bundle budget OK: ${names.length} JS chunk(s), ${initialGzipBytes} initial / ${totalGzipBytes} total gzip bytes`,
)
