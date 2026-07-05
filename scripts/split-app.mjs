import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const appPath = path.join(root, 'src/App.tsx')
const screensDir = path.join(root, 'src/screens')

const content = fs.readFileSync(appPath, 'utf8')
const lines = content.split('\n')

const starts = []
for (let index = 0; index < lines.length; index += 1) {
  const match = lines[index].match(/^function (\w+)\(/)
  if (match) starts.push({ name: match[1], line: index })
}

const skip = new Set(['App', 'csvCell', 'normalizeHttpUrl', 'downloadCsv', 'recordActivityLog'])
fs.mkdirSync(screensDir, { recursive: true })

for (let index = 0; index < starts.length; index += 1) {
  const { name, line } = starts[index]
  if (skip.has(name)) continue
  const end = starts[index + 1]?.line ?? lines.length - 1
  let body = lines.slice(line, end).join('\n')
  body = body.replace(/^function /, 'export function ')
  const outfile = path.join(screensDir, `${name}.tsx`)
  fs.writeFileSync(outfile, `${body}\n`)
  console.log(`Wrote ${name} (${end - line} lines)`)
}
