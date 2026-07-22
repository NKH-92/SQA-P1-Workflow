import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const assetsDir = path.resolve('dist/assets')
const MAX_CHUNK_BYTES = 560 * 1024
// Event history, strict aggregate-envelope validation, bigint-safe cursors,
// OCC/modal handling, and the source-backed Brand Shell dashboards
// are all shipped client-side. The dashboard addition raised the measured total
// by ~2.1 KiB without adding a dependency; keep the revised ceiling tight with
// less than 0.6% headroom while preserving the existing per-chunk ceiling.
const MAX_TOTAL_GZIP_BYTES = 186 * 1024

const names = (await readdir(assetsDir)).filter((name) => name.endsWith('.js'))
if (names.length === 0) throw new Error('Bundle budget check found no JavaScript assets')

let totalGzipBytes = 0
const oversized = []
for (const name of names) {
  const content = await readFile(path.join(assetsDir, name))
  totalGzipBytes += gzipSync(content).byteLength
  if (content.byteLength > MAX_CHUNK_BYTES) oversized.push(`${name}: ${content.byteLength} bytes`)
}

if (oversized.length > 0) {
  throw new Error(`JavaScript chunk budget exceeded (${MAX_CHUNK_BYTES} bytes):\n${oversized.join('\n')}`)
}
if (totalGzipBytes > MAX_TOTAL_GZIP_BYTES) {
  throw new Error(`Total JavaScript gzip budget exceeded: ${totalGzipBytes} > ${MAX_TOTAL_GZIP_BYTES} bytes`)
}

console.log(`Bundle budget OK: ${names.length} JS chunk(s), ${totalGzipBytes} total gzip bytes`)
