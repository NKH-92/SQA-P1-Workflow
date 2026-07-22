import { createHash } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SHA_PATTERN = /^[0-9a-f]{40}$/
const SHA256_PATTERN = /^[0-9a-f]{64}$/
const PROVENANCE_KEYS = [
  'schemaVersion',
  'sha',
  'ref',
  'lockfileSha256',
  'readinessManifestSha256',
  'builtAt',
]

export function resolveProjectPath(projectRoot, relativePath) {
  if (typeof relativePath !== 'string' || relativePath.length === 0) {
    throw new Error('Build provenance path must be a non-empty relative path')
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error('Build provenance path must be relative to the project root')
  }
  const resolvedRoot = path.resolve(projectRoot)
  const resolvedPath = path.resolve(resolvedRoot, relativePath)
  const relative = path.relative(resolvedRoot, resolvedPath)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error('Build provenance path resolves outside the project root')
  }
  return resolvedPath
}

export async function sha256File(filePath) {
  return createHash('sha256').update(await readFile(filePath)).digest('hex')
}

export function validateBuildProvenance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Build provenance must be a JSON object')
  }
  const keys = Object.keys(value)
  if (keys.length !== PROVENANCE_KEYS.length || PROVENANCE_KEYS.some((key) => !keys.includes(key))) {
    throw new Error(`Build provenance keys must be exactly: ${PROVENANCE_KEYS.join(', ')}`)
  }
  if (value.schemaVersion !== 1) throw new Error('Build provenance schemaVersion must be 1')
  if (value.sha !== 'local' && !SHA_PATTERN.test(value.sha)) {
    throw new Error('Build provenance SHA must be local or a lowercase 40-character Git SHA')
  }
  if (value.ref !== 'local' && value.ref !== 'refs/heads/main') {
    throw new Error('Build provenance ref must be local or refs/heads/main')
  }
  if (!SHA256_PATTERN.test(value.lockfileSha256)) {
    throw new Error('Build provenance lockfileSha256 must be a lowercase SHA-256 digest')
  }
  if (!SHA256_PATTERN.test(value.readinessManifestSha256)) {
    throw new Error('Build provenance readinessManifestSha256 must be a lowercase SHA-256 digest')
  }
  if (typeof value.builtAt !== 'string' || Number.isNaN(Date.parse(value.builtAt))) {
    throw new Error('Build provenance builtAt must be an ISO timestamp')
  }
  if (new Date(value.builtAt).toISOString() !== value.builtAt) {
    throw new Error('Build provenance builtAt must use canonical ISO format')
  }
  return value
}

export async function createBuildProvenance({ projectRoot, env = process.env, now = new Date() }) {
  const mode = env.BUILD_PROVENANCE_MODE ?? 'local'
  if (mode !== 'local' && mode !== 'production') {
    throw new Error('BUILD_PROVENANCE_MODE must be local or production')
  }

  const sha = mode === 'local' ? 'local' : (env.BUILD_PROVENANCE_SHA ?? env.GITHUB_SHA ?? '')
  const ref = mode === 'local' ? 'local' : (env.BUILD_PROVENANCE_REF ?? env.GITHUB_REF ?? '')
  if (mode === 'production' && !SHA_PATTERN.test(sha)) {
    throw new Error('Production build provenance SHA must be a lowercase 40-character Git SHA')
  }
  if (mode === 'production' && ref !== 'refs/heads/main') {
    throw new Error('Production build provenance ref must be refs/heads/main')
  }

  const provenance = {
    schemaVersion: 1,
    sha,
    ref,
    lockfileSha256: await sha256File(resolveProjectPath(projectRoot, 'package-lock.json')),
    readinessManifestSha256: await sha256File(
      resolveProjectPath(projectRoot, 'scripts/sql/verify/manifest.json'),
    ),
    builtAt: now.toISOString(),
  }
  return validateBuildProvenance(provenance)
}

export async function writeBuildProvenance({ projectRoot, env = process.env, now = new Date() }) {
  const outputPath = resolveProjectPath(projectRoot, env.BUILD_PROVENANCE_OUTPUT ?? 'dist/version.json')
  const provenance = await createBuildProvenance({ projectRoot, env, now })
  await mkdir(path.dirname(outputPath), { recursive: true })
  await writeFile(outputPath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8')
  validateBuildProvenance(JSON.parse(await readFile(outputPath, 'utf8')))
  return outputPath
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const outputPath = await writeBuildProvenance({ projectRoot: process.cwd() })
    console.log(`Build provenance written: ${path.relative(process.cwd(), outputPath)}`)
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
