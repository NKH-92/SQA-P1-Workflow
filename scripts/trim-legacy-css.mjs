import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cssPath = path.join(root, 'src/styles.css')
const lines = fs.readFileSync(cssPath, 'utf8').split('\n')

const v2Index = lines.findIndex((line) => line.includes('V2 Warm Paper Theme'))
if (v2Index < 0) throw new Error('V2 theme section not found')

const preamble = `/* ==========================================================================
   SQA P1 Workflow – Warm Paper Theme
   ========================================================================== */

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: var(--gray-300);
  border-radius: var(--radius-full);
}

::-webkit-scrollbar-thumb:hover {
  background: var(--gray-400);
}
`

const v2Section = lines.slice(v2Index - 1).join('\n')
const merged = `${preamble}\n\n${v2Section}`

const layoutTokens = `
  --sidebar-w: 232px;
  --radius-full: 9999px;
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur-fast: 150ms;
  --dur-normal: 250ms;
  --dur-slow: 350ms;
`

const output = merged.replace(
  ':root {\n  --paper-bg:',
  `:root {\n${layoutTokens}  --paper-bg:`,
)

fs.writeFileSync(cssPath, output)
console.log(`styles.css: ${lines.length} -> ${output.split('\n').length} lines`)
