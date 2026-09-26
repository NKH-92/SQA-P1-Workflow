import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const assetsDir = path.resolve('dist/assets')
const manifestPath = path.resolve('dist/.vite/manifest.json')
const MAX_CHUNK_BYTES = 560 * 1024
// Route-level lazy loading reduced the measured initial JS from ~185.3 KiB to
// ~140.3 KiB. Splitting gzip dictionaries raises the all-routes sum, so enforce
// both dimensions: initial navigation and the total code surface.
// 2026-09 UX overhaul: origin/main measured 144,903 B. The always-on shell gained the
// mobile tab bar, stacked toasts, history-aware overlays and the profile area; the
// command palette, notification panel and sign-in/password/error gate screens moved to
// lazy chunks to compensate. Measured 147,034 B afterwards, so the cap moves to 146 KiB.
const MAX_INITIAL_GZIP_BYTES = 146 * 1024
// The change-application route lazy-loads the browser-only XLSX reader when a
// leader selects a file. This raises the all-routes sum while keeping initial
// navigation unchanged, so retain a narrow cap around the measured surface.
// 2026-09 UX overhaul: 240,351 B → 275,234 B measured. The growth is route code for the
// requested features (duty reassignment, one-pass product transfer and overflow menus in
// master; bulk actions, drafts and attention filters in change applications; resubmit
// with edits, decision-time sorting and inline validation in reviews; project edit/delete
// dialogs) plus chunk overhead from the new lazy gate screens.
const MAX_TOTAL_GZIP_BYTES = 272 * 1024
// 빠른 이동(Ctrl K)과 알림 패널은 열 때만 쓰므로 첫 화면에서 빼고 지연 로딩한다(한가할 때 미리 받음).
const EXPECTED_ROUTE_DYNAMIC_IMPORTS = new Set([
  'src/components/CommandPalette.tsx',
  'src/components/NotificationPanel.tsx',
  // 로그인·비밀번호 변경·계정 안내·설정 오류 화면은 해당 상태일 때만 받는다.
  'src/screens/AuthPanel.tsx',
  'src/screens/BlockedProfile.tsx',
  'src/screens/ConfigErrorScreen.tsx',
  'src/screens/PasswordChangePanel.tsx',
  'src/screens/ProfileLoadErrorScreen.tsx',
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
