// 같은 미디어 조건 안에서 같은 선택자를 두 번 이상 선언하면(예: 기본 절과 뒤쪽 덮어쓰기 절),
// 나중에 고친 모바일 규칙이 더 뒤의 선언에 조용히 덮여 무시된다. 예전 층(V3·V4·hardening)에서
// 물려받은 중복은 기준 목록(css-duplicate-baseline.json)에 두고, 새 중복만 막는다.
// 중복을 없앴다면 `node scripts/check-css-duplicates.mjs --update`로 기준 목록을 줄인다.
import { readdir, readFile, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const baselineUrl = new URL('scripts/css-duplicate-baseline.json', root)
const screensDir = new URL('src/screens/', root)
const stylesheets = [
  'src/styles.css',
  ...(await readdir(screensDir)).filter((name) => name.endsWith('.css')).map((name) => `src/screens/${name}`),
]

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '))
}

function blockEnd(css, open) {
  let depth = 0
  for (let index = open; index < css.length; index += 1) {
    if (css[index] === '{') depth += 1
    else if (css[index] === '}') {
      depth -= 1
      if (depth === 0) return index
    }
  }
  throw new Error('Unbalanced braces')
}

/** 선택자 목록을 괄호 안 쉼표(:is(a, b))는 건드리지 않고 나눈다. */
function splitSelectors(prelude) {
  const parts = []
  let depth = 0
  let current = ''
  for (const char of prelude) {
    if (char === '(') depth += 1
    if (char === ')') depth -= 1
    if (char === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else current += char
  }
  parts.push(current)
  return parts.map((part) => part.trim().replace(/\s+/g, ' ')).filter(Boolean)
}

function collect(file, css, start, end, context, seen) {
  let index = start
  while (index < end) {
    const open = css.indexOf('{', index)
    if (open === -1 || open >= end) return
    const prelude = css.slice(index, open).split(';').pop().trim()
    const close = blockEnd(css, open)
    if (prelude.startsWith('@media') || prelude.startsWith('@supports')) {
      collect(file, css, open + 1, close, `${context}${prelude.replace(/\s+/g, ' ')} `, seen)
    } else if (!prelude.startsWith('@')) {
      const line = css.slice(0, open).split('\n').length
      for (const selector of splitSelectors(prelude)) {
        const key = `${context}${selector}`
        const places = seen.get(key) ?? []
        places.push(`${file}:${line}`)
        seen.set(key, places)
      }
    }
    index = close + 1
  }
}

const seen = new Map()
for (const file of stylesheets) {
  const css = stripComments(await readFile(new URL(file, root), 'utf8'))
  collect(file, css, 0, css.length, '', seen)
}
const duplicates = [...seen].filter(([, places]) => places.length > 1)
const current = duplicates.map(([key]) => key).sort()

if (process.argv.includes('--update')) {
  await writeFile(baselineUrl, `${JSON.stringify(current, null, 2)}\n`)
  console.log(`CSS duplicate baseline updated: ${current.length} selector(s)`)
} else {
  const baseline = new Set(JSON.parse(await readFile(baselineUrl, 'utf8')))
  const added = duplicates.filter(([key]) => !baseline.has(key))
  if (added.length > 0) {
    console.error('New duplicate CSS selectors (edit the existing rule instead of re-declaring it):')
    for (const [key, places] of added) console.error(`- ${key}\n    ${places.join(', ')}`)
    process.exitCode = 1
  } else {
    const resolved = [...baseline].filter((key) => !seen.has(key) || seen.get(key).length < 2)
    const hint = resolved.length > 0
      ? ` (${resolved.length} baseline entr${resolved.length === 1 ? 'y is' : 'ies are'} gone — run with --update to shrink the baseline)`
      : ''
    console.log(`CSS duplicates OK: no new duplicate selectors, ${current.length} legacy${hint}`)
  }
}
