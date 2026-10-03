import { chromium } from '@playwright/test'
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
const args = process.argv.slice(2)
const option = (name, fallback) => { const at = args.indexOf(name); return at < 0 ? fallback : args[at + 1] }
const dimensions = (b) => b.length >= 24 && b.toString('ascii', 1, 4) === 'PNG' ? `${b.readUInt32BE(16)}×${b.readUInt32BE(20)}` : 'invalid PNG'
if (args.includes('--compare')) {
  const at = args.indexOf('--compare'), a = args[at + 1], b = args[at + 2]
  const names = [...new Set([...(await readdir(a)), ...(await readdir(b))])].filter(n => n.endsWith('.png')).sort()
  const inspect = async (dir, name) => { try { const bytes = await readFile(path.join(dir, name)); return { bytes: bytes.length, size: dimensions(bytes) } } catch { return { bytes: null, size: 'missing' } } }
  const rows = []
  for (const name of names) { const left = await inspect(a, name), right = await inspect(b, name); rows.push({ name, before: left.bytes, after: right.bytes, dimensions: `${left.size} → ${right.size}` }) }
  console.table(rows)
} else {
  const out = option('--out', 'captures'), url = option('--url', 'http://127.0.0.1:4173')
  const widths = option('--widths', '1440,1366,820,390').split(',').map(Number)
  const roles = option('--roles', 'leader,team_leader,member').split(',')
  const themes = option('--themes', 'pixel,classic').split(',')
  // Read the application tab inventory, rather than maintaining another route contract.
  const navigation = await readFile('src/lib/navigation.ts', 'utf8')
  const allTabs = [...navigation.match(/APP_TABS = \[([\s\S]*?)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1])
  const tabs = option('--tabs', allTabs.join(',')).split(',')
  const ids = { leader: 'demo-leader', member: 'member-01', team_leader: 'demo-team-leader' }
  const labels = { leader: '파트장', member: '파트원', team_leader: '팀장' }
  const heights = { 1440: 900, 1366: 657, 820: 1180, 390: 844 }
  await mkdir(out, { recursive: true })
  const browser = await chromium.launch({ channel: 'chrome' })
  const report = []
  try {
    for (const width of widths) for (const role of roles) for (const theme of themes) {
      if (!ids[role] || !['pixel', 'classic'].includes(theme) || !heights[width]) throw new Error('Unsupported capture filter')
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', e => errors.push(e.message))
      await page.addInitScript(({ ids, theme }) => {
        for (const id of Object.values(ids)) {
          localStorage.setItem(`sqa.home-mode.${id}`, 'classic')
          localStorage.setItem(`sqa.ui-theme.${id}`, theme)
          localStorage.setItem(`sqa.morning-brief-off.${id}`, '1')
        }
      }, { ids, theme })
      await page.goto(url)
      await page.getByRole('group', { name: '미리보기 역할' }).getByRole('button', { name: labels[role], exact: true }).click()
      await page.setViewportSize({ width, height: heights[width] })
      for (const tab of tabs) {
        if (!allTabs.includes(tab)) throw new Error(`Unknown tab: ${tab}`)
        const allowed = role === 'member' ? ['dashboard','announcements','reviews','change-applications','projects','work'].includes(tab) : tab !== 'work'
        if (!allowed) { report.push({ width, role, theme, tab, skipped: '역할 권한에 없는 화면' }); continue }
        const previous = await page.title()
        const previousHash = await page.evaluate(() => location.hash)
        await page.evaluate(tab => { location.hash = `#/${tab}` }, tab)
        if (previousHash !== `#/${tab}`) await page.waitForFunction(previous => document.title !== previous, previous)
        await page.locator('.content').waitFor()
        await page.locator('.route-loading').waitFor({ state: 'hidden' })
        await page.evaluate(async () => {
          const sidebar = document.querySelector('.sidebar')
          if (sidebar) sidebar.scrollTop = 0
          await document.fonts.ready
          await Promise.all([...document.images].map(img => img.decode().catch(() => {})))
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        })
        const file = `${width}_${role}_${theme}_${tab}.png`
        await page.screenshot({ path: path.join(out, file), fullPage: true, animations: 'disabled' })
        report.push({ file, bytes: (await stat(path.join(out, file))).size, errors: [...errors] })
      }
      await context.close()
    }
  } finally { await browser.close() }
  await writeFile(path.join(out, 'manifest.json'), JSON.stringify(report, null, 2))
  console.log(`Captured ${report.filter(r => r.file).length} screens; ${report.filter(r => r.skipped).length} permission skips. ${out}/manifest.json`)
  if (report.some(r => r.errors?.length)) process.exitCode = 1
}
