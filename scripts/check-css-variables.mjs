import { readFile } from 'node:fs/promises'

const stylesheets = [
  new URL('../src/styles.css', import.meta.url),
  new URL('../src/styles.final-hardening.css', import.meta.url),
]
const stylesheet = (await Promise.all(
  stylesheets.map((stylesheetUrl) => readFile(stylesheetUrl, 'utf8')),
)).join('\n')
const defined = new Set([...stylesheet.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)].map((match) => match[1]))
const used = new Set([...stylesheet.matchAll(/var\((--[a-zA-Z0-9-]+)/g)].map((match) => match[1]))

// These values are supplied as component-level inline custom properties.
const dynamic = new Set(['--allocation-percent', '--dashboard-progress'])
const missing = [...used].filter((token) => !defined.has(token) && !dynamic.has(token)).sort()

if (missing.length > 0) {
  console.error(`Undefined CSS custom properties:\n${missing.map((token) => `- ${token}`).join('\n')}`)
  process.exitCode = 1
} else {
  console.log(`CSS variables OK: ${used.size} references resolved`)
}
