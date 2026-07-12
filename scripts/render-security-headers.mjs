import { readFile, writeFile } from 'node:fs/promises'
import { pathToFileURL, URL } from 'node:url'

const templatePath = process.env.SECURITY_HEADERS_TEMPLATE ?? 'public/_headers'
const outputPath = process.env.SECURITY_HEADERS_OUTPUT ?? 'dist/_headers'
const supabaseUrl = process.env.VITE_SUPABASE_URL

function originForCsp(value) {
  if (!value) return null
  const parsed = new URL(value)
  const isLocal = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost'
  const isHostedSupabase = /^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)
  if (!isLocal && !isHostedSupabase) {
    throw new Error('VITE_SUPABASE_URL must point to localhost or a *.supabase.co origin')
  }
  if (!isLocal && parsed.protocol !== 'https:') {
    throw new Error('Hosted Supabase URL must use HTTPS')
  }
  return {
    httpsOrigin: parsed.origin,
    websocketOrigin: `${parsed.protocol === 'https:' ? 'wss:' : 'ws:'}//${parsed.host}`,
  }
}

export function renderSecurityHeaders(template, value) {
  const origins = originForCsp(value)
  if (!origins) return template
  return template
    .replace('https://*.supabase.co', origins.httpsOrigin)
    .replace('wss://*.supabase.co', origins.websocketOrigin)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const template = await readFile(templatePath, 'utf8')
  await writeFile(outputPath, renderSecurityHeaders(template, supabaseUrl), 'utf8')
}
