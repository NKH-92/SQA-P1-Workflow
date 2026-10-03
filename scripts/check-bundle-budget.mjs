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
// 2026-09 full-screen office home: 149,246 B → 152,591 B measured. The always-on shell now carries the
// office top menu (HUD) and drawer layout, the app-wide instant-meeting banner, its Realtime/30-second sync
// and the meeting/home-mode data adapters, so every screen can confirm a meeting. Lazy-loading the top menu
// was measured to save only ~150 B, so the cap moves to 150 KiB instead.
// 2026-09 office round 6: 152,591 B → 158,469 B measured. Personal presence is shown on every screen (sidebar
// and top-menu status button) and kept live with the meeting room: presence parsing/validation, its local and
// remote repositories, the combined office Realtime/30-second sync, the scheduled-meeting banner model and the
// pixel-mode context now ship with the shell. The status dialog itself, the pixel faces and screen vignettes stay
// lazy, and the classic status button uses a CSS dot instead of line icons (−0.7 KiB). The cap moves to 156 KiB.
// 2026-09 ops preflight fixes: 158,613 B → 150,167 B measured after dropping the preview-only local repositories and
// demo-data work from production bundles. The cap is re-tightened to 150 KiB: about 3.3 KiB of headroom, so a small
// hotfix does not fail CI/Deploy builds (the old cap left ~1 KiB), while still catching real growth.
const MAX_INITIAL_GZIP_BYTES = 150 * 1024
// The change-application route lazy-loads the browser-only XLSX reader when a
// leader selects a file. This raises the all-routes sum while keeping initial
// navigation unchanged, so retain a narrow cap around the measured surface.
// 2026-09 UX overhaul: 240,351 B → 275,234 B measured. The growth is route code for the
// requested features (duty reassignment, one-pass product transfer and overflow menus in
// master; bulk actions, drafts and attention filters in change applications; resubmit
// with edits, decision-time sorting and inline validation in reviews; project edit/delete
// dialogs) plus chunk overhead from the new lazy gate screens.
// 2026-09 home pixel office: 275,271 B → 293,480 B measured. The requested office scene (sprite maps,
// scene painter, behaviour loop and the leader seat editor) lives in the lazy dashboard chunk
// (6,700 → 23,311 B); initial navigation grew only by the office data adapters (146,940 → 148,425 B).
// 2026-09 office round 2: 293,480 B → 299,529 B measured. Walking trips (standing/walking sprites,
// path finding), the pharma-QA scene objects, clickable objects/people and the full-width scene sizing
// all stay in the lazy dashboard chunk (23,311 → 29,356 B); initial navigation is unchanged (148,437 B).
// Office object alerts then measured 300,955 B total: the alert model in the dashboard chunk (→ 30,000 B)
// and the per-person read marks (fetch, repositories, section-visit marker) in initial navigation
// (148,437 → 149,246 B, still under the 146 KiB cap).
// Full-screen office home and instant meetings then measured 311,263 B total: the expanded office world
// (new objects, meeting room, lower-floor walking), the full-screen home with its quest panel and the meeting
// dialog in the lazy dashboard chunk (30,000 → 36,942 B), plus the initial-shell additions noted above.
// Office round 6 then measured 330,985 B total: the time-of-day window sky and the re-zoned office world,
// seat status signs, the scheduled/elsewhere meeting dialog, the lazy status dialog, and the pixel design for
// work screens (character faces, office vignettes) now shared by the dashboard and the announcement, review,
// change, project and team routes through common office chunks (no module is duplicated), plus the initial
// additions noted above.
// The ops preflight fixes then measured 324,527 B total, so the cap is re-tightened to 321 KiB (about 4.2 KiB of
// headroom, same hotfix rationale as the initial cap).
const MAX_TOTAL_GZIP_BYTES = 321 * 1024
// 빠른 이동(Ctrl K)과 알림 패널은 열 때만 쓰므로 첫 화면에서 빼고 지연 로딩한다(한가할 때 미리 받음).
const EXPECTED_ROUTE_DYNAMIC_IMPORTS = new Set([
  'src/components/CommandPalette.tsx',
  'src/features/office/officeEmptyArt.tsx',
  'src/components/NotificationPanel.tsx',
  // 로그인·비밀번호 변경·계정 안내·설정 오류 화면은 해당 상태일 때만 받는다.
  'src/screens/AuthPanel.tsx',
  'src/screens/BlockedProfile.tsx',
  'src/screens/ConfigErrorScreen.tsx',
  'src/screens/PasswordChangePanel.tsx',
  'src/screens/ProfileLoadErrorScreen.tsx',
  // 내 상태(잠깐 비움·휴가·출장) 창은 열 때만 받는다.
  'src/features/office/components/MemberPresenceDialog.tsx',
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
