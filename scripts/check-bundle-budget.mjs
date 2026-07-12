import { gzipSync } from 'node:zlib'
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'

const assetsDir = path.resolve('dist/assets')
const MAX_CHUNK_BYTES = 560 * 1024
const MAX_TOTAL_GZIP_BYTES = 180 * 1024

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
